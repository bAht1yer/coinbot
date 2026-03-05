/**
 * CostEstimator.ts - Professional Cost Calculation Module
 * 
 * Handles fee rates, slippage, precision, and break-even analysis
 */

import { FeeRate, OrderBook, TradingPair, CostBreakdown, OrderBookLevel } from './types';

export class CostEstimator {
    private feeRates: Map<string, FeeRate> = new Map();
    private tradingPairs: Map<string, TradingPair> = new Map();

    constructor() {
        this.initializeDefaultFees();
        this.initializeTradingPairs();
    }

    /**
     * Initialize default fee rates for major exchanges
     * In production: Fetch from API and update dynamically
     */
    private initializeDefaultFees(): void {
        // Coinbase Advanced Trade fees (example)
        this.feeRates.set('COINBASE', {
            maker: 0.004,  // 0.4% (can be lower with volume)
            taker: 0.006,  // 0.6%
            platformDiscount: 0,
        });

        // TODO: Add other exchanges (Binance, Kraken, etc.)
    }

    /**
     * Initialize trading pair specifications
     * In production: Fetch from exchange API
     */
    private initializeTradingPairs(): void {
        this.tradingPairs.set('BTC-USD', {
            symbol: 'BTC-USD',
            baseAsset: 'BTC',
            quoteAsset: 'USD',
            lotSizeMin: 0.0001,
            lotSizeStep: 0.0001,
            priceStep: 0.01,
            minNotional: 10.0,
        });

        this.tradingPairs.set('ETH-USD', {
            symbol: 'ETH-USD',
            baseAsset: 'ETH',
            quoteAsset: 'USD',
            lotSizeMin: 0.001,
            lotSizeStep: 0.001,
            priceStep: 0.01,
            minNotional: 10.0,
        });
    }

    /**
     * Normalize quantity to exchange precision
     * Prevents "LOT_SIZE" errors
     */
    public normalizeQuantity(symbol: string, quantity: number): number {
        const pair = this.tradingPairs.get(symbol);
        if (!pair) return quantity;

        const { lotSizeMin, lotSizeStep } = pair;

        // Round down to step precision
        const normalized = Math.floor(quantity / lotSizeStep) * lotSizeStep;

        // Ensure meets minimum
        return Math.max(normalized, lotSizeMin);
    }

    /**
     * Normalize price to exchange precision
     * Prevents "PRICE_FILTER" errors
     */
    public normalizePrice(symbol: string, price: number): number {
        const pair = this.tradingPairs.get(symbol);
        if (!pair) return price;

        const { priceStep } = pair;
        return Math.round(price / priceStep) * priceStep;
    }

    /**
     * Calculate slippage from order book depth
     * Returns VWAP (Volume Weighted Average Price) and slippage cost
     */
    public calculateSlippage(
        orderBook: OrderBook,
        side: 'BUY' | 'SELL',
        quantity: number
    ): { vwap: number; slippageCost: number; feasible: boolean } {
        const levels = side === 'BUY' ? orderBook.asks : orderBook.bids;

        let remainingQty = quantity;
        let totalCost = 0;
        let totalQtyFilled = 0;

        for (const level of levels) {
            if (remainingQty <= 0) break;

            const qtyAtThisLevel = Math.min(remainingQty, level.quantity);
            totalCost += qtyAtThisLevel * level.price;
            totalQtyFilled += qtyAtThisLevel;
            remainingQty -= qtyAtThisLevel;
        }

        // Check if order book has enough liquidity
        if (remainingQty > 0) {
            return {
                vwap: 0,
                slippageCost: 0,
                feasible: false, // Not enough liquidity!
            };
        }

        const vwap = totalCost / totalQtyFilled;

        // Calculate slippage cost vs best price
        const bestPrice = levels[0].price;
        const slippageCost = Math.abs((vwap - bestPrice) * totalQtyFilled);

        return { vwap, slippageCost, feasible: true };
    }

    /**
     * Calculate trading fees
     */
    public calculateFee(
        exchange: string,
        side: 'BUY' | 'SELL',
        quantity: number,
        price: number,
        orderType: 'MARKET' | 'LIMIT'
    ): number {
        const feeRate = this.feeRates.get(exchange) || this.feeRates.get('COINBASE')!;

        // Market orders are always takers
        // Limit orders can be makers if they add liquidity
        const rate = orderType === 'MARKET' ? feeRate.taker : feeRate.maker;

        const notional = quantity * price;
        return notional * rate * (1 - feeRate.platformDiscount);
    }

    /**
     * CORE FUNCTION: Calculate complete cost breakdown
     * This gives you the DETERMINISTIC break-even point
     */
    public estimateTradeCost(params: {
        symbol: string;
        exchange: string;
        side: 'BUY' | 'SELL';
        quantity: number;
        entryPrice: number;
        exitPrice: number;
        orderBook?: OrderBook;
        orderType?: 'MARKET' | 'LIMIT';
        fundingRate?: number; // For futures (per 8h, e.g., 0.0001)
        holdingPeriodHours?: number;
    }): CostBreakdown {
        const {
            symbol,
            exchange,
            side,
            quantity,
            entryPrice,
            exitPrice,
            orderBook,
            orderType = 'MARKET',
            fundingRate = 0,
            holdingPeriodHours = 0,
        } = params;

        // Normalize to exchange precision
        const normalizedQty = this.normalizeQuantity(symbol, quantity);
        const normalizedEntryPrice = this.normalizePrice(symbol, entryPrice);
        const normalizedExitPrice = this.normalizePrice(symbol, exitPrice);

        // Calculate entry fee
        const entryFee = this.calculateFee(
            exchange,
            side,
            normalizedQty,
            normalizedEntryPrice,
            orderType
        );

        // Calculate exit fee
        const exitSide = side === 'BUY' ? 'SELL' : 'BUY';
        const exitFee = this.calculateFee(
            exchange,
            exitSide,
            normalizedQty,
            normalizedExitPrice,
            orderType
        );

        // Calculate slippage (if order book provided)
        let entrySlippage = 0;
        let exitSlippage = 0;

        if (orderBook) {
            const entrySlippageCalc = this.calculateSlippage(orderBook, side, normalizedQty);
            if (entrySlippageCalc.feasible) {
                entrySlippage = entrySlippageCalc.slippageCost;
            }

            const exitSlippageCalc = this.calculateSlippage(orderBook, exitSide, normalizedQty);
            if (exitSlippageCalc.feasible) {
                exitSlippage = exitSlippageCalc.slippageCost;
            }
        }

        // Calculate funding fee (for perpetual futures)
        const fundingPeriods = Math.ceil(holdingPeriodHours / 8);
        const fundingFee = normalizedQty * normalizedEntryPrice * fundingRate * fundingPeriods;

        // Total cost
        const totalCost = entryFee + exitFee + entrySlippage + exitSlippage + Math.abs(fundingFee);

        // Calculate break-even price
        // For LONG: Need price to rise enough to cover all costs
        // For SHORT: Need price to fall enough to cover all costs
        const costPerUnit = totalCost / normalizedQty;
        const breakEvenPrice = side === 'BUY'
            ? normalizedEntryPrice + costPerUnit
            : normalizedEntryPrice - costPerUnit;

        const breakEvenPercentage = ((breakEvenPrice - normalizedEntryPrice) / normalizedEntryPrice) * 100;

        return {
            entryPrice: normalizedEntryPrice,
            entryQuantity: normalizedQty,
            entryFee,
            entrySlippage,

            exitPrice: normalizedExitPrice,
            exitQuantity: normalizedQty,
            exitFee,
            exitSlippage,

            fundingFee,
            totalCost,

            breakEvenPrice,
            breakEvenPercentage,
        };
    }

    /**
     * Calculate actual PnL for a completed trade
     */
    public calculatePnL(costBreakdown: CostBreakdown): number {
        const { entryPrice, exitPrice, entryQuantity, totalCost } = costBreakdown;

        // Gross P/L
        const grossPnL = (exitPrice - entryPrice) * entryQuantity;

        // Net P/L (after all costs)
        const netPnL = grossPnL - totalCost;

        return netPnL;
    }

    /**
     * Update fee rates dynamically (call periodically from API)
     */
    public updateFeeRate(exchange: string, feeRate: FeeRate): void {
        this.feeRates.set(exchange, feeRate);
    }

    /**
     * Update trading pair specifications
     */
    public updateTradingPair(symbol: string, pair: TradingPair): void {
        this.tradingPairs.set(symbol, pair);
    }
}

// Singleton instance
export const costEstimator = new CostEstimator();
