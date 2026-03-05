import * as jose from 'jose';
import { ApiCredentials } from './types';

const COINBASE_API_HOST = 'api.coinbase.com';
const API_VERSION = '/api/v3/brokerage';

/**
 * Generate JWT token for Coinbase API authentication using Ed25519
 */
export async function generateJwt(
    credentials: ApiCredentials,
    method: string,
    path: string
): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 120; // 2 minutes
    const nonce = generateNonce();

    // JWT URI format: "METHOD host/path" (no https://)
    const uri = `${method} ${COINBASE_API_HOST}${path}`;

    // The privateKey from Coinbase JSON is 64 bytes base64:
    // First 32 bytes = private key seed, Last 32 bytes = public key
    const fullKeyBytes = base64ToUint8Array(credentials.privateKey);
    const privateKeySeed = fullKeyBytes.slice(0, 32);

    // Import the Ed25519 private key
    const privateKey = await jose.importPKCS8(
        createEd25519Pem(privateKeySeed),
        'EdDSA'
    ).catch(async () => {
        // Fallback: try raw import
        return crypto.subtle.importKey(
            'raw',
            privateKeySeed,
            { name: 'Ed25519' },
            false,
            ['sign']
        );
    });

    // Create JWT
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
        .sign(privateKey as CryptoKey);

    return jwt;
}

/**
 * Create PEM format from raw Ed25519 private key bytes
 */
function createEd25519Pem(privateKeyBytes: Uint8Array): string {
    // Ed25519 PKCS#8 header
    const pkcs8Header = new Uint8Array([
        0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
        0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
    ]);

    const pkcs8Key = new Uint8Array(pkcs8Header.length + privateKeyBytes.length);
    pkcs8Key.set(pkcs8Header);
    pkcs8Key.set(privateKeyBytes, pkcs8Header.length);

    const base64Key = uint8ArrayToBase64(pkcs8Key);
    return `-----BEGIN PRIVATE KEY-----\n${base64Key}\n-----END PRIVATE KEY-----`;
}

/**
 * Generate random nonce for JWT
 */
function generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Base64 to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Uint8Array to Base64
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
}

/**
 * Coinbase API client for server-side use only
 */
export class CoinbaseClient {
    private credentials: ApiCredentials | null = null;

    setCredentials(credentials: ApiCredentials) {
        this.credentials = credentials;
    }

    hasCredentials(): boolean {
        return this.credentials !== null &&
            this.credentials.keyId.length > 0 &&
            this.credentials.privateKey.length > 0;
    }

    private async request<T>(
        method: string,
        endpoint: string,
        body?: object
    ): Promise<T> {
        if (!this.credentials) {
            throw new Error('API credentials not configured');
        }

        const path = API_VERSION + endpoint;
        // Strip query params for JWT
        const jwtPath = path.includes('?') ? path.substring(0, path.indexOf('?')) : path;

        const jwt = await generateJwt(this.credentials, method, jwtPath);

        const response = await fetch(`https://${COINBASE_API_HOST}${path}`, {
            method,
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.error || `API Error: ${response.status}`);
        }

        return data as T;
    }

    async getAccounts() {
        return this.request<{ accounts: any[] }>('GET', '/accounts');
    }

    async getTicker(productId: string) {
        return this.request<any>('GET', `/products/${productId}/ticker?limit=1`);
    }

    async getCandles(productId: string, granularity: string, limit = 100) {
        const end = Math.floor(Date.now() / 1000);
        const granularitySeconds = getGranularitySeconds(granularity);
        const start = end - (granularitySeconds * limit);

        return this.request<{ candles: any[] }>(
            'GET',
            `/products/${productId}/candles?granularity=${granularity}&start=${start}&end=${end}`
        );
    }

    async placeMarketBuy(productId: string, quoteAmount: number) {
        const clientOrderId = crypto.randomUUID();
        return this.request<any>('POST', '/orders', {
            client_order_id: clientOrderId,
            product_id: productId,
            side: 'BUY',
            order_configuration: {
                market_market_ioc: {
                    quote_size: quoteAmount.toFixed(2),
                },
            },
        });
    }

    async placeMarketSell(productId: string, baseAmount: number) {
        const clientOrderId = crypto.randomUUID();
        return this.request<any>('POST', '/orders', {
            client_order_id: clientOrderId,
            product_id: productId,
            side: 'SELL',
            order_configuration: {
                market_market_ioc: {
                    base_size: baseAmount.toFixed(8),
                },
            },
        });
    }
}

function getGranularitySeconds(granularity: string): number {
    const map: Record<string, number> = {
        'ONE_MINUTE': 60,
        'FIVE_MINUTE': 300,
        'FIFTEEN_MINUTE': 900,
        'THIRTY_MINUTE': 1800,
        'ONE_HOUR': 3600,
        'TWO_HOUR': 7200,
        'SIX_HOUR': 21600,
        'ONE_DAY': 86400,
    };
    return map[granularity] || 900;
}

// Singleton instance for server-side use
export const coinbaseClient = new CoinbaseClient();
