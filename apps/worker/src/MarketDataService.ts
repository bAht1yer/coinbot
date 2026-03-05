/**
 * MarketDataService.ts - Fetch real-time market data
 * 
 * Handles price fetching, order book retrieval, and market analysis
 * Uses PUBLIC Exchange API for USD pairs (no auth required)
 * Uses AUTHENTICATED Brokerage API for USDC pairs
 */

import { OrderBook, TradingPair } from './types';
import { coinbaseTrader } from './CoinbaseTrader';
import { logger } from './logger';

// USDC pairs require authenticated API
const USDC_PAIRS = ['BTC-USDC', 'ETH-USDC', 'SOL-USDC'];

export class MarketDataService {
    private baseUrl: string;

    // Using public Exchange API (no auth required for market data)
    constructor(baseUrl = 'https://api.exchange.coinbase.com') {
        this.baseUrl = baseUrl;
    }

    /**
     * Check if a symbol is a USDC pair
     */
    private isUsdcPair(symbol: string): boolean {
        return symbol.endsWith('-USDC') || USDC_PAIRS.includes(symbol);
    }

    /**
     * Fetch current ticker price
     * Uses authenticated API for USDC pairs, public API for USD pairs
     */
    async getCurrentPrice(symbol: string): Promise<number | null> {
        // For USDC pairs, use authenticated Brokerage API
        if (this.isUsdcPair(symbol)) {
            const hasCredentials = await coinbaseTrader.hasCredentials();
            if (!hasCredentials) {
                logger.error(`[MarketData] USDC pair ${symbol} requires API credentials`);
                return null;
            }
            return await coinbaseTrader.getProductPrice(symbol);
        }

        // For USD pairs, use public Exchange API
        try {
            const response = await fetch(
                `${this.baseUrl}/products/${symbol}/ticker`,
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                logger.error(`Failed to fetch price for ${symbol}`);
                return null;
            }

            const data = await response.json() as { price: string };
            return data.price ? parseFloat(data.price) : null;
        } catch (error) {
            logger.error(`Error fetching price: ${error}`);
            return null;
        }
    }

    /**
     * Fetch recent closing prices for RSI calculation
     * Returns array of closing prices (oldest to newest)
     * Uses authenticated API for USDC pairs
     */
    async getRecentPrices(symbol: string, count = 20): Promise<number[]> {
        // For USDC pairs, use authenticated Brokerage API
        if (this.isUsdcPair(symbol)) {
            const hasCredentials = await coinbaseTrader.hasCredentials();
            if (!hasCredentials) {
                logger.error(`[MarketData] USDC pair ${symbol} requires API credentials for candles`);
                return [];
            }
            return await coinbaseTrader.getProductCandles(symbol, 'FIFTEEN_MINUTE', count);
        }

        // For USD pairs, use public Exchange API
        try {
            // Coinbase Exchange API: /products/{product_id}/candles
            // Granularity: 60 = 1 minute, 300 = 5 min, 900 = 15 min, 3600 = 1 hour
            const granularity = 900; // 15-minute candles

            const response = await fetch(
                `${this.baseUrl}/products/${symbol}/candles?granularity=${granularity}`,
                {
                    headers: { 'Content-Type': 'application/json' },
                }
            );

            if (!response.ok) {
                logger.error(`Failed to fetch candles for ${symbol}`);
                return [];
            }

            // Returns array of [time, low, high, open, close, volume]
            const candles = await response.json() as number[][];

            // Get closing prices (index 4), reverse to oldest-first
            const prices = candles
                .slice(0, count)
                .map(c => c[4])
                .reverse();

            logger.info(`[MarketData] Fetched ${prices.length} candles for ${symbol}`);
            return prices;
        } catch (error) {
            logger.error(`Error fetching candles: ${error}`);
            return [];
        }
    }

    /**
     * Fetch hourly prices for EMA200 calculation
     * EMA200 needs 200+ data points - using 1H candles to cover 200+ hours (~8 days)
     * This doesn't affect trade frequency - EMA is just for trend context
     */
    async getRecentPricesHourly(symbol: string, count = 210): Promise<number[]> {
        // For USDC pairs, use authenticated Brokerage API
        if (this.isUsdcPair(symbol)) {
            const hasCredentials = await coinbaseTrader.hasCredentials();
            if (!hasCredentials) {
                logger.error(`[MarketData] USDC pair ${symbol} requires API credentials for hourly candles`);
                return [];
            }
            return await coinbaseTrader.getProductCandles(symbol, 'ONE_HOUR', count);
        }

        // For USD pairs, use public Exchange API
        try {
            const granularity = 3600; // 1-hour candles

            const response = await fetch(
                `${this.baseUrl}/products/${symbol}/candles?granularity=${granularity}`,
                {
                    headers: { 'Content-Type': 'application/json' },
                }
            );

            if (!response.ok) {
                logger.error(`Failed to fetch hourly candles for ${symbol}`);
                return [];
            }

            const candles = await response.json() as number[][];

            const prices = candles
                .slice(0, count)
                .map(c => c[4])
                .reverse();

            logger.info(`[MarketData] Fetched ${prices.length} HOURLY candles for ${symbol} (for EMA200)`);
            return prices;
        } catch (error) {
            logger.error(`Error fetching hourly candles: ${error}`);
            return [];
        }
    }

    /**
     * Fetch order book depth
     * CRITICAL for slippage calculation
     */
    async getOrderBook(symbol: string, depth = 20): Promise<OrderBook | null> {
        try {
            const response = await fetch(
                `${this.baseUrl}/products/${symbol}/book?level=2`,
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                logger.error(`Failed to fetch order book for ${symbol}`);
                return null;
            }

            const data = await response.json() as { asks: string[][]; bids: string[][] };
            if (!data.asks || !data.bids) return null;

            return {
                asks: data.asks.slice(0, depth).map((level: string[]) => ({
                    price: parseFloat(level[0]),
                    quantity: parseFloat(level[1]),
                })),
                bids: data.bids.slice(0, depth).map((level: string[]) => ({
                    price: parseFloat(level[0]),
                    quantity: parseFloat(level[1]),
                })),
                timestamp: Date.now(),
            };
        } catch (error) {
            logger.error(`Error fetching order book: ${error}`);
            return null;
        }
    }

    /**
     * Fetch trading pair specifications
     */
    async getTradingPairInfo(symbol: string): Promise<TradingPair | null> {
        try {
            const response = await fetch(
                `${this.baseUrl}/products/${symbol}`,
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                logger.error(`Failed to fetch pair info for ${symbol}`);
                return null;
            }

            const data = await response.json() as any;
            if (!data.product_id) return null;

            return {
                symbol: data.product_id,
                baseAsset: data.base_currency,
                quoteAsset: data.quote_currency,
                lotSizeMin: parseFloat(data.base_min_size),
                lotSizeStep: parseFloat(data.base_increment),
                priceStep: parseFloat(data.quote_increment),
                minNotional: parseFloat(data.min_market_funds || '10'),
            };
        } catch (error) {
            logger.error(`Error fetching trading pair info: ${error}`);
            return null;
        }
    }

    /**
     * Calculate simple RSI (Relative Strength Index)
     * For basic momentum analysis
     */
    calculateRSI(prices: number[], period = 14): number {
        if (prices.length < period + 1) return 50;

        const changes: number[] = [];
        for (let i = 1; i < prices.length; i++) {
            changes.push(prices[i] - prices[i - 1]);
        }

        let avgGain = 0;
        let avgLoss = 0;

        for (let i = 0; i < period; i++) {
            if (changes[i] > 0) avgGain += changes[i];
            else avgLoss += Math.abs(changes[i]);
        }

        avgGain /= period;
        avgLoss /= period;

        for (let i = period; i < changes.length; i++) {
            const change = changes[i];
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? Math.abs(change) : 0;
            avgGain = ((avgGain * (period - 1)) + gain) / period;
            avgLoss = ((avgLoss * (period - 1)) + loss) / period;
        }

        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    /**
     * Calculate EMA (Exponential Moving Average) for Trend Detection
     * @param prices - Array of prices (oldest to newest)
     * @param period - EMA period (default 200 for long-term trend)
     */
    calculateEMA(prices: number[], period = 200): number | null {
        if (prices.length < period) {
            logger.info(`[MarketData] Insufficient data for EMA${period} (have ${prices.length})`);
            return null;
        }

        // Calculate SMA for the first period as the starting EMA value
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += prices[i];
        }
        let ema = sum / period;

        // Smoothing factor
        const multiplier = 2 / (period + 1);

        // Calculate EMA for remaining values
        for (let i = period; i < prices.length; i++) {
            ema = (prices[i] - ema) * multiplier + ema;
        }

        return ema;
    }
}

// Singleton instance
export const marketDataService = new MarketDataService();
