/**
 * types.ts - Core Trading Types
 */

export interface FeeRate {
    maker: number;        // e.g., 0.001 (0.1%)
    taker: number;        // e.g., 0.006 (0.6%)
    platformDiscount: number; // e.g., 0.25 (25% off if using BNB)
}

export interface OrderBookLevel {
    price: number;
    quantity: number;
}

export interface OrderBook {
    asks: OrderBookLevel[];  // Sell orders (ascending price)
    bids: OrderBookLevel[];  // Buy orders (descending price)
    timestamp: number;
}

export interface TradingPair {
    symbol: string;          // e.g., "BTC-USD"
    baseAsset: string;       // e.g., "BTC"
    quoteAsset: string;      // e.g., "USD"

    // Precision filters
    lotSizeMin: number;      // Minimum order quantity
    lotSizeStep: number;     // Quantity increment (0.001 for BTC)
    priceStep: number;       // Price increment (0.01 for USD)
    minNotional: number;     // Minimum order value in quote currency
}

export interface CostBreakdown {
    // Entry costs
    entryPrice: number;
    entryQuantity: number;
    entryFee: number;
    entrySlippage: number;

    // Exit costs
    exitPrice: number;
    exitQuantity: number;
    exitFee: number;
    exitSlippage: number;

    // Additional costs
    fundingFee: number;      // For perpetual futures

    // Total costs
    totalCost: number;

    // Break-even analysis
    breakEvenPrice: number;  // Price needed to profit
    breakEvenPercentage: number;
}

export interface TradeSignal {
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;      // 0-1
    reason: string;

    // If action is BUY or SELL
    suggestedPrice?: number;
    suggestedQuantity?: number;
    orderType?: 'MARKET' | 'LIMIT';
}
