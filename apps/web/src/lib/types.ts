// Coinbase API Types

export interface Account {
    uuid: string;
    name: string;
    currency: string;
    available_balance: {
        value: string;
        currency: string;
    };
    hold: {
        value: string;
        currency: string;
    };
    type: string;
    active: boolean;
}

export interface AccountsResponse {
    accounts: Account[];
}

export interface Trade {
    trade_id: string;
    product_id: string;
    price: string;
    size: string;
    time: string;
    side: string;
}

export interface Ticker {
    trades: Trade[];
    best_bid: string;
    best_ask: string;
}

export interface TickerResponse {
    trades: Trade[];
    best_bid: string;
    best_ask: string;
}

export interface Candle {
    start: string;
    low: string;
    high: string;
    open: string;
    close: string;
    volume: string;
}

export interface CandlesResponse {
    candles: Candle[];
}

export interface OrderConfiguration {
    market_market_ioc?: {
        quote_size?: string;  // For BUY (USD amount)
        base_size?: string;   // For SELL (crypto amount)
    };
    limit_limit_gtc?: {
        base_size: string;
        limit_price: string;
        post_only: boolean;
    };
}

export interface OrderRequest {
    client_order_id: string;
    product_id: string;
    side: 'BUY' | 'SELL';
    order_configuration: OrderConfiguration;
}

export interface OrderSuccessResponse {
    order_id: string;
    product_id: string;
    side: string;
    client_order_id: string;
}

export interface OrderErrorResponse {
    error: string;
    message: string;
    error_details: string;
}

export interface OrderResponse {
    success: boolean;
    success_response?: OrderSuccessResponse;
    error_response?: OrderErrorResponse;
}

// Trading types
export interface TradingSettings {
    selectedProduct: string;
    tradingEnabled: boolean;
    paperTradingMode: boolean;

    // Price threshold strategy
    priceThresholdEnabled: boolean;
    buyBelowPrice: number;
    sellAbovePrice: number;
    buyAmountUsd: number;
    maxPositionUsd: number;
    sellPercentage: number;

    // Grid buying
    gridBuyingEnabled: boolean;
    gridDropPercent: number;
    gridMaxLayers: number;

    // RSI filter
    rsiFilterEnabled: boolean;
    rsiPeriod: number;
    rsiOversold: number;

    // Trailing stop
    trailingStopEnabled: boolean;
    trailingStopTrigger: number;
    trailingStopDistance: number;

    // Risk management
    cooldownMinutes: number;
    stopLossPct: number;     // Stop Loss percentage (e.g., 2 = 2%)
    takeProfitPct: number;   // Take Profit percentage (e.g., 5 = 5%)

    // Telegram
    telegramEnabled: boolean;
    telegramBotToken: string;
    telegramChatId: string;
}

export interface PositionState {
    product: string;
    quantity: number;
    averageEntryPrice: number;
    highestPrice: number;
    lastTradeTime: Date | null;
    gridLayer: number;
    gridBasePrice: number;
}

export interface TradeLogEntry {
    id: string;
    time: Date;
    product: string;
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    realizedPnl?: number;
    pnlPercent?: number;
    orderId: string;
    status: 'FILLED' | 'PAPER' | 'FAILED' | 'ERROR';
    notes: string;
    sessionId?: string | null; // Session this trade belongs to
}

export type SignalType = 'NONE' | 'BUY' | 'SELL' | 'TRAILING_STOP_SELL';

export interface TradingSignal {
    type: SignalType;
    product: string;
    price: number;
    amount: number;
    reason: string;
}

// API Credentials (server-side only)
export interface ApiCredentials {
    keyId: string;          // From JSON "id" field
    privateKey: string;     // From JSON "privateKey" field (base64 Ed25519)
}

// Constants
// Supported trading pairs
// USD pairs work on public API, USDC pairs need authenticated Brokerage API
export const SUPPORTED_PRODUCTS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BTC-USDC', 'ETH-USDC'];

export const DEFAULT_SETTINGS: TradingSettings = {
    selectedProduct: 'BTC-USD',
    tradingEnabled: false,
    paperTradingMode: true,

    priceThresholdEnabled: true,
    buyBelowPrice: 90000,
    sellAbovePrice: 110000,
    buyAmountUsd: 50,
    maxPositionUsd: 500,
    sellPercentage: 50,

    gridBuyingEnabled: false,
    gridDropPercent: 3,
    gridMaxLayers: 3,

    rsiFilterEnabled: true,
    rsiPeriod: 14,
    rsiOversold: 30,

    trailingStopEnabled: true,
    trailingStopTrigger: 25,
    trailingStopDistance: 8,

    cooldownMinutes: 5,
    stopLossPct: 2,
    takeProfitPct: 5,

    telegramEnabled: false,
    telegramBotToken: '',
    telegramChatId: '',
};
