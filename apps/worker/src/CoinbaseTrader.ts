/**
 * CoinbaseTrader.ts - Real Order Placement for Worker
 * 
 * Fetches API credentials from database (encrypted)
 * Places real orders via Coinbase Advanced Trade API
 */

import { prisma } from './lib/prisma';
import crypto from 'crypto';
import { logger } from './logger';

const COINBASE_API_HOST = 'api.coinbase.com';
const API_VERSION = '/api/v3/brokerage';

// Per-user credential cache (prevents mixing credentials in multi-user environment)
const credentialCache = new Map<string, { keyId: string; privateKey: string }>();

/**
 * Decryption function (must match encryption in web app)
 */
function getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;

    if (!key) {
        throw new Error(
            'ENCRYPTION_KEY environment variable is required. ' +
            'Set it in Railway environment variables.'
        );
    }

    if (key.length === 64) {
        return Buffer.from(key, 'hex');
    }

    return crypto.createHash('sha256').update(key).digest();
}

function decrypt(encryptedData: string): string {
    const key = getEncryptionKey();

    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Get current user's cached credentials
 */
function getCachedCredentials(userId?: string): { keyId: string; privateKey: string } | null {
    if (!userId) {
        logger.warn('[CoinbaseTrader] getCachedCredentials called without userId');
        return null;
    }
    const creds = credentialCache.get(userId);
    if (!creds) {
        logger.warn(`[CoinbaseTrader] No credentials in cache for userId: ${userId}`);
    }
    return creds || null;
}

/**
 * Load API credentials from database for current user
 */
async function loadCredentials(userId?: string): Promise<{ keyId: string; privateKey: string } | null> {
    const cached = getCachedCredentials(userId);
    if (cached) return cached;
    return null; // Use loadCredentialsForUser instead
}

/**
 * Generate JWT for Coinbase API authentication
 */
async function generateJwt(
    credentials: { keyId: string; privateKey: string },
    method: string,
    path: string
): Promise<string> {
    // Dynamic import for jose (ES module)
    const jose = await import('jose');

    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 120;
    const nonce = crypto.randomBytes(16).toString('hex');

    const uri = `${method} ${COINBASE_API_HOST}${path}`;

    // Parse base64 private key
    const fullKeyBytes = Buffer.from(credentials.privateKey, 'base64');
    const privateKeySeed = fullKeyBytes.slice(0, 32);

    // Create Ed25519 PKCS#8 PEM
    const pkcs8Header = Buffer.from([
        0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
        0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
    ]);
    const pkcs8Key = Buffer.concat([pkcs8Header, privateKeySeed]);
    const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8Key.toString('base64')}\n-----END PRIVATE KEY-----`;

    const privateKey = await jose.importPKCS8(pem, 'EdDSA');

    const jwt = await new jose.SignJWT({
        sub: credentials.keyId,
        iss: 'cdp',
        nbf: now,
        exp: expiry,
        uri: uri,
    })
        .setProtectedHeader({
            alg: 'EdDSA',
            typ: 'JWT',
            kid: credentials.keyId,
            nonce: nonce,
        })
        .sign(privateKey);

    return jwt;
}

/**
 * Make authenticated API request
 */
async function apiRequest<T>(
    method: string,
    endpoint: string,
    body?: object,
    userId?: string
): Promise<T> {
    logger.info(`[CoinbaseTrader] API Request: ${method} ${endpoint} for userId: ${userId || 'undefined'}`);
    const credentials = await loadCredentials(userId);
    if (!credentials) {
        throw new Error(`No API credentials available for user ${userId || 'undefined'}`);
    }

    const path = API_VERSION + endpoint;
    const jwtPath = path.includes('?') ? path.substring(0, path.indexOf('?')) : path;

    const jwt = await generateJwt(credentials, method, jwtPath);

    const response = await fetch(`https://${COINBASE_API_HOST}${path}`, {
        method,
        headers: {
            'Authorization': `Bearer ${jwt}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
        const msg = (data.message as string) || (data.error as string) || `API Error: ${response.status}`;
        throw new Error(msg);
    }

    return data as T;
}

/**
 * CoinbaseTrader - Order Placement
 */
export const coinbaseTrader = {
    /**
     * Check if credentials are available
     */
    async hasCredentials(userId?: string): Promise<boolean> {
        const creds = await loadCredentials(userId);
        return creds !== null;
    },

    /**
     * Place a market BUY order
     * @param productId - e.g., "BTC-USD"
     * @param quoteAmount - USD amount to spend
     */
    async placeMarketBuy(productId: string, quoteAmount: number, userId?: string): Promise<{
        success: boolean;
        orderId?: string;
        error?: string;
    }> {
        const clientOrderId = crypto.randomUUID();

        logger.info(`[CoinbaseTrader] Placing BUY order: $${quoteAmount} ${productId}`);

        try {
            const result = await apiRequest<any>('POST', '/orders', {
                client_order_id: clientOrderId,
                product_id: productId,
                side: 'BUY',
                order_configuration: {
                    market_market_ioc: {
                        quote_size: quoteAmount.toFixed(2),
                    },
                },
            }, userId);

            logger.info(`[CoinbaseTrader] BUY order placed: ${result.order_id || clientOrderId}`);

            return {
                success: true,
                orderId: result.order_id || clientOrderId,
            };
        } catch (error) {
            logger.error(`[CoinbaseTrader] BUY order failed: ${error}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },

    /**
     * Place a market SELL order
     * @param productId - e.g., "BTC-USD"
     * @param baseAmount - Amount of base currency to sell
     */
    async placeMarketSell(productId: string, baseAmount: number, userId?: string): Promise<{
        success: boolean;
        orderId?: string;
        error?: string;
    }> {
        const clientOrderId = crypto.randomUUID();

        logger.info(`[CoinbaseTrader] Placing SELL order: ${baseAmount} ${productId.split('-')[0]}`);

        try {
            const result = await apiRequest<any>('POST', '/orders', {
                client_order_id: clientOrderId,
                product_id: productId,
                side: 'SELL',
                order_configuration: {
                    market_market_ioc: {
                        base_size: baseAmount.toFixed(8),
                    },
                },
            }, userId);

            logger.info(`[CoinbaseTrader] SELL order placed: ${result.order_id || clientOrderId}`);

            return {
                success: true,
                orderId: result.order_id || clientOrderId,
            };
        } catch (error) {
            logger.error(`[CoinbaseTrader] SELL order failed: ${error}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },

    /**
     * Get account balances
     */
    async getAccounts(userId?: string): Promise<any[]> {
        try {
            const result = await apiRequest<{ accounts: any[] }>('GET', '/accounts', undefined, userId);
            return result.accounts;
        } catch (error) {
            logger.error(`[CoinbaseTrader] Failed to get accounts: ${error}`);
            return [];
        }
    },

    /**
     * Get balance for a specific asset (e.g., BTC, ETH)
     * Returns { available: number, total: number }
     */
    async getAssetBalance(asset: string, userId?: string): Promise<{ available: number; total: number }> {
        try {
            const accounts = await this.getAccounts(userId);
            const account = accounts.find(a => a.currency === asset);

            if (!account) {
                return { available: 0, total: 0 };
            }

            const available = parseFloat(account.available_balance?.value || '0');
            const hold = parseFloat(account.hold?.value || '0');

            return {
                available,
                total: available + hold,
            };
        } catch (error) {
            logger.error(`[CoinbaseTrader] Failed to get balance for ${asset}: ${error}`);
            return { available: 0, total: 0 };
        }
    },

    /**
     * Get product price (for USDC pairs that need authenticated API)
     * Uses Brokerage API: GET /products/{product_id}
     */
    async getProductPrice(productId: string, userId?: string): Promise<number | null> {
        try {
            const result = await apiRequest<{ price: string; price_percentage_change_24h: string }>(
                'GET',
                `/products/${productId}`,
                undefined,
                userId
            );
            return result.price ? parseFloat(result.price) : null;
        } catch (error) {
            logger.error(`[CoinbaseTrader] Failed to get price for ${productId}: ${error}`);
            return null;
        }
    },

    /**
     * Get product candles for RSI calculation (authenticated API)
     * Uses Brokerage API: GET /products/{product_id}/candles
     */
    async getProductCandles(productId: string, granularity = 'FIFTEEN_MINUTE', limit = 20, userId?: string): Promise<number[]> {
        try {
            // Map granularity to seconds for time calculation
            const granularitySeconds: Record<string, number> = {
                'ONE_MINUTE': 60,
                'FIVE_MINUTE': 300,
                'FIFTEEN_MINUTE': 900,
                'ONE_HOUR': 3600,
                'SIX_HOUR': 21600,
                'ONE_DAY': 86400,
            };
            const intervalSeconds = granularitySeconds[granularity] || 900;

            const end = Math.floor(Date.now() / 1000);
            const start = end - (intervalSeconds * limit);

            const result = await apiRequest<{ candles: Array<{ close: string }> }>(
                'GET',
                `/products/${productId}/candles?granularity=${granularity}&start=${start}&end=${end}`,
                undefined,
                userId
            );

            // Extract closing prices, reverse to oldest-first
            const prices = result.candles
                .map(c => parseFloat(c.close))
                .reverse();

            logger.info(`[CoinbaseTrader] Fetched ${prices.length} ${granularity} candles for ${productId}`);
            return prices;
        } catch (error) {
            logger.error(`[CoinbaseTrader] Failed to get candles for ${productId}: ${error}`);
            return [];
        }
    },

    /**
     * Load credentials for a specific user
     * Used for multi-user trading
     */
    async loadCredentialsForUser(userId: string): Promise<boolean> {
        try {
            // Check cache first
            if (credentialCache.has(userId)) {
                return true;
            }

            const credentials = await prisma.apiCredentials.findFirst({
                where: { userId, isActive: true },
            });

            if (!credentials) {
                logger.warn(`[CoinbaseTrader] No credentials found for user ${userId.slice(0, 8)}`);
                return false;
            }

            // Decrypt the private key
            const privateKey = decrypt(credentials.apiKeySecret);

            // Store in per-user cache
            credentialCache.set(userId, {
                keyId: credentials.apiKeyId,
                privateKey,
            });

            logger.info(`[CoinbaseTrader] Loaded credentials for user ${userId.slice(0, 8)}: ${credentials.apiKeyId.slice(0, 8)}...`);
            return true;
        } catch (error) {
            logger.error(`[CoinbaseTrader] Failed to load credentials for user ${userId}: ${error}`);
            return false;
        }
    },

    /**
     * Clear cached credentials for a specific user or all users
     */
    clearCache(userId?: string) {
        if (userId) {
            credentialCache.delete(userId);
        } else {
            credentialCache.clear();
        }
    },
};
