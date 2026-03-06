/**
 * executionEngine.ts - Professional Trading Logic
 * 
 * Uses CostEstimator for deterministic PnL calculation
 * Makes informed decisions based on break-even analysis
 */

import { costEstimator } from './CostEstimator';
import { marketDataService } from './MarketDataService';
import { coinbaseTrader } from './CoinbaseTrader';
import { logger } from './logger';
import { TradeSignal, CostBreakdown } from './types';

interface TradeConfig {
    symbol: string;
    strategy: string;
    riskLevel: string;
    maxTradeSize: number;
    maxPositionUsd?: number;
    sellPercentage?: number;
    stopLoss: number;
    takeProfit: number;
    isPaperTrading: boolean;
    userId: string;
    // RSI settings from DB config
    rsiFilterEnabled?: boolean;
    rsiOversold?: number;
}

interface TradeResult {
    executed: boolean;
    symbol: string;
    action: 'BUY' | 'SELL';
    amount: number;
    price: number;
    fee: number;
    totalCost: number;
    profit?: number;
    notes?: string;
    costBreakdown?: CostBreakdown;
    isPaperTrade: boolean; // True if this was a paper/simulated trade
    orderId?: string; // Order ID from exchange or PAPER_xxx
}

export const executionEngine = {
    /**
     * Main execution function
     * Uses professional cost estimation before trading
     */
    async executeTrade(config: TradeConfig): Promise<TradeResult | null> {
        const { symbol, strategy, maxTradeSize, isPaperTrading, userId } = config;

        await logger.infoForUser(userId, `Analyzing ${symbol} with ${strategy} strategy... ${isPaperTrading ? '(PAPER)' : '(LIVE)'}`);

        // 1. Fetch real-time market data
        const currentPrice = await marketDataService.getCurrentPrice(symbol, userId);
        if (!currentPrice) {
            await logger.errorForUser(userId, `Failed to fetch price for ${symbol}`);
            return null;
        }

        await logger.infoForUser(userId, `${symbol} Price: $${currentPrice.toFixed(2)}`);

        // 2. Fetch order book for slippage analysis
        const orderBook = await marketDataService.getOrderBook(symbol, 20);

        // 3. Analyze market and generate signal
        const signal = await this.analyzeMarket(currentPrice, config);

        if (signal.action === 'HOLD') {
            await logger.infoForUser(userId, `Signal: HOLD - ${signal.reason}`);
            return null;
        }

        // 4. Calculate trade size in base currency
        let quantity = maxTradeSize / currentPrice;

        if (signal.action === 'BUY') {
            const quoteAsset = symbol.split('-')[1]; // e.g., USD
            const quoteBalance = await coinbaseTrader.getAssetBalance(quoteAsset, userId);

            // Limit buy size to available USD balance (leave 1% for potential fees)
            const maxAffordableBuy = (quoteBalance.available * 0.99) / currentPrice;
            if (quantity > maxAffordableBuy) {
                quantity = maxAffordableBuy;
                if (quantity > 0) {
                    await logger.warnForUser(userId, `Wallet balance low: Reducing BUY size to $${(quantity * currentPrice).toFixed(2)}`);
                }
            }

            // Check max position constraint
            if (config.maxPositionUsd) {
                const baseAsset = symbol.split('-')[0];
                const baseBalance = await coinbaseTrader.getAssetBalance(baseAsset, userId);
                const currentPositionUsd = baseBalance.total * currentPrice;

                if (currentPositionUsd >= config.maxPositionUsd) {
                    await logger.infoForUser(userId, `⏸️ Max Position Reached: ${baseBalance.total.toFixed(6)} ${baseAsset} (~$${currentPositionUsd.toFixed(2)}) >= $${config.maxPositionUsd}. Skipping BUY.`);
                    return null;
                }

                const remainingSpaceUsd = config.maxPositionUsd - currentPositionUsd;
                const remainingSpaceQty = remainingSpaceUsd / currentPrice;
                if (quantity > remainingSpaceQty) {
                    quantity = remainingSpaceQty;
                    await logger.warnForUser(userId, `Max position constraint: Reducing BUY size to $${Math.max(0, quantity * currentPrice).toFixed(2)}`);
                }
            }
        } else if (signal.action === 'SELL') {
            const baseAsset = symbol.split('-')[0];
            const baseBalance = await coinbaseTrader.getAssetBalance(baseAsset, userId);

            // Sell a percentage of the available balance
            const sellPct = (config.sellPercentage || 100) / 100;
            quantity = baseBalance.available * sellPct;

            if (quantity <= 0) {
                await logger.warnForUser(userId, `No ${baseAsset} balance available to sell. Skipping trades.`);
                return null;
            }
        }

        // If effective quantity is too small ($2 equivalent)
        if (quantity * currentPrice < 2) {
            await logger.warnForUser(userId, `Trade size too small after limits ($${(quantity * currentPrice).toFixed(2)}). Skipping trade.`);
            return null;
        }

        const normalizedQty = costEstimator.normalizeQuantity(symbol, quantity);

        await logger.infoForUser(userId, `Signal: ${signal.action} ${normalizedQty} ${symbol.split('-')[0]}`);
        // 5. CRITICAL: Estimate costs BEFORE placing order
        const expectedExitPrice = signal.action === 'BUY'
            ? currentPrice * (1 + config.takeProfit)
            : currentPrice * (1 - config.takeProfit);

        const costBreakdown = costEstimator.estimateTradeCost({
            symbol,
            exchange: 'COINBASE',
            side: signal.action,
            quantity: normalizedQty,
            entryPrice: currentPrice,
            exitPrice: expectedExitPrice,
            orderBook: orderBook || undefined,
            orderType: 'MARKET',
        });

        // 6. Log cost analysis to database
        const detailedAnalysis = `[Cost Analysis]
Entry: $${costBreakdown.entryPrice.toFixed(2)} | Fee: $${costBreakdown.entryFee.toFixed(2)} | Slip: $${costBreakdown.entrySlippage.toFixed(2)}
Exit (est): Fee: $${costBreakdown.exitFee.toFixed(2)} | Slip: $${costBreakdown.exitSlippage.toFixed(2)}
Total Cost: $${costBreakdown.totalCost.toFixed(2)}
Break-Even: $${costBreakdown.breakEvenPrice.toFixed(2)} (${costBreakdown.breakEvenPercentage.toFixed(2)}%)`;

        await logger.infoForUser(userId, detailedAnalysis);

        // 7. Check if trade is profitable
        const estimatedPnL = costEstimator.calculatePnL(costBreakdown);
        // console.log(`  Estimated PnL at target: $${estimatedPnL.toFixed(2)}`); // Redundant if captured above or irrelevant

        if (estimatedPnL <= 0) {
            await logger.errorForUser(userId, 'Trade rejected: Negative expected PnL after costs');
            return null;
        }

        // 8. Execute trade
        const orderResult = await this.placeOrder(symbol, signal.action, normalizedQty, currentPrice, isPaperTrading, userId);

        if (!orderResult.success) {
            await logger.errorForUser(userId, `Order placement failed: ${orderResult.error}`);
            return null;
        }

        // 9. Return trade result
        const tradeResult: TradeResult = {
            executed: true,
            symbol,
            action: signal.action,
            amount: normalizedQty,
            price: currentPrice,
            fee: costBreakdown.entryFee,
            totalCost: normalizedQty * currentPrice + costBreakdown.entryFee,
            notes: `${strategy} | BE: $${costBreakdown.breakEvenPrice.toFixed(2)} | ${signal.reason}`,
            costBreakdown,
            isPaperTrade: isPaperTrading,
            orderId: orderResult.orderId,
        };

        await logger.successForUser(userId, `Trade executed: ${signal.action} ${normalizedQty.toFixed(6)} ${symbol.split('-')[0]} @ $${currentPrice.toFixed(2)} [${isPaperTrading ? 'PAPER' : 'LIVE'}]`);

        return tradeResult;
    },

    /**
     * Market analysis logic
     * Returns trading signal based on RSI strategy
     */
    async analyzeMarket(currentPrice: number, config: TradeConfig): Promise<TradeSignal> {
        const { symbol, strategy, userId } = config;

        // Fetch recent prices for RSI calculation
        const prices = await marketDataService.getRecentPrices(symbol, 20, userId);

        if (prices.length < 15) {
            logger.info(`[Strategy] Insufficient price data for ${symbol}`);
            return {
                action: 'HOLD',
                confidence: 0,
                reason: 'Insufficient price data',
            };
        }

        // Calculate RSI
        const rsi = marketDataService.calculateRSI(prices, 14);
        logger.info(`[Strategy] ${symbol} RSI(14): ${rsi.toFixed(2)}`);

        if (strategy === 'MOMENTUM') {
            // RSI Strategy:
            // - RSI < 30 = Oversold → BUY signal
            // - RSI > 70 = Overbought → SELL signal (if holding)
            // - 30-70 = Neutral → HOLD

            // Fetch HOURLY prices for EMA200 (200 hours = ~8 days of trend data)
            // This doesn't affect trade frequency - EMA is just for trend context
            const longPrices = await marketDataService.getRecentPricesHourly(symbol, 210, userId);
            const ema200 = marketDataService.calculateEMA(longPrices, 200);

            // Trend Check: Only allow BUY if price > EMA200 (Uptrend)
            if (ema200 !== null && currentPrice < ema200) {
                logger.info(`EMA BLOCK: Price $${currentPrice.toFixed(2)} < EMA200 $${ema200.toFixed(2)} (Downtrend)`);
                return {
                    action: 'HOLD',
                    confidence: 0.3,
                    reason: `Downtrend: Price < EMA200 (${ema200.toFixed(0)})`,
                };
            }

            // Use RSI threshold from config (default to 30 if not provided)
            const rsiOversoldThreshold = config.rsiOversold ?? 30;
            const rsiFilterEnabled = config.rsiFilterEnabled ?? true;

            // If RSI filter is disabled, skip RSI-based buy signal
            if (!rsiFilterEnabled) {
                return {
                    action: 'HOLD',
                    confidence: 0.5,
                    reason: `RSI filter disabled`,
                };
            }

            if (rsi < rsiOversoldThreshold) {
                const confidence = Math.min((rsiOversoldThreshold - rsi) / rsiOversoldThreshold, 1);
                return {
                    action: 'BUY',
                    confidence,
                    reason: `RSI ${rsi.toFixed(1)} < ${rsiOversoldThreshold} (Oversold) | Uptrend OK`,
                    suggestedPrice: currentPrice,
                    suggestedQuantity: 0.001,
                    orderType: 'MARKET',
                };
            }

            if (rsi > 70) {
                const confidence = Math.min((rsi - 70) / 30, 1);
                return {
                    action: 'SELL',
                    confidence,
                    reason: `RSI ${rsi.toFixed(1)} > 70 (Overbought)`,
                    suggestedPrice: currentPrice,
                    orderType: 'MARKET',
                };
            }

            return {
                action: 'HOLD',
                confidence: 0.5,
                reason: `RSI ${rsi.toFixed(1)} neutral (30-70 range)`,
            };
        }

        return {
            action: 'HOLD',
            confidence: 0.5,
            reason: `Unknown strategy: ${strategy}`,
        };
    },

    /**
     * CRITICAL: Manage existing position with Stop Loss and Take Profit
     * This function checks if price has hit SL or TP and triggers immediate sell.
     * @returns true if a position was closed, false otherwise
     */
    async managePosition(
        userId: string,
        symbol: string,
        currentPrice: number,
        averageEntryPrice: number,
        positionQty: number,
        stopLossPct: number,
        takeProfitPct: number,
        isPaperTrading: boolean
    ): Promise<{ closed: boolean; reason?: string }> {
        const stopLossPrice = averageEntryPrice * (1 - stopLossPct);
        const takeProfitPrice = averageEntryPrice * (1 + takeProfitPct);

        // STOP LOSS CHECK
        if (currentPrice <= stopLossPrice) {
            await logger.errorForUser(userId, `🛑 STOP LOSS TRIGGERED! Price $${currentPrice.toFixed(2)} <= SL $${stopLossPrice.toFixed(2)}`);
            const sellResult = await this.placeOrder(symbol, 'SELL', positionQty, currentPrice, isPaperTrading, userId);
            if (sellResult.success) {
                await logger.infoForUser(userId, `Exited position at $${currentPrice.toFixed(2)} via Stop Loss`);
                return { closed: true, reason: 'Stop Loss' };
            }
        }

        // TAKE PROFIT CHECK
        if (currentPrice >= takeProfitPrice) {
            await logger.infoForUser(userId, `🎯 TAKE PROFIT HIT! Price $${currentPrice.toFixed(2)} >= TP $${takeProfitPrice.toFixed(2)}`);
            const sellResult = await this.placeOrder(symbol, 'SELL', positionQty, currentPrice, isPaperTrading, userId);
            if (sellResult.success) {
                await logger.infoForUser(userId, `Exited position at $${currentPrice.toFixed(2)} via Take Profit`);
                return { closed: true, reason: 'Take Profit' };
            }
        }

        // No action needed
        return { closed: false };
    },

    /**
     * Place order on exchange using CoinbaseTrader
     * @param symbol - Trading pair (e.g., "BTC-USD")
     * @param side - BUY or SELL
     * @param quantity - Amount in base currency
     * @param price - Current price (for USD calculation)
     */
    async placeOrder(
        symbol: string,
        side: 'BUY' | 'SELL',
        quantity: number,
        price: number,
        isPaperTrading: boolean = false,
        userId?: string
    ): Promise<{ success: boolean; orderId?: string; error?: string; orderType?: 'PAPER' | 'LIVE' | 'FAILED' }> {
        // CASE 1: Paper trading - simulate order, never call API
        if (isPaperTrading) {
            const paperId = 'PAPER_' + Date.now();
            if (userId) {
                await logger.infoForUser(userId, `📝 PAPER TRADE: Simulated ${side} ${quantity.toFixed(6)} ${symbol} @ $${price.toFixed(2)}`);
            }
            return { success: true, orderId: paperId, orderType: 'PAPER' };
        }

        // CASE 2: Live trading - MUST have valid credentials
        const hasCredentials = await coinbaseTrader.hasCredentials(userId);

        if (!hasCredentials) {
            // CRITICAL: Do NOT silently succeed! This is a real failure.
            const errorMsg = 'LIVE TRADE BLOCKED: No valid API credentials loaded. Trade NOT executed.';
            if (userId) {
                await logger.errorForUser(userId, `🚫 ${errorMsg}`);
            }
            logger.error(`[ExecutionEngine] ${errorMsg}`);
            return { success: false, error: errorMsg, orderType: 'FAILED' };
        }

        // CASE 3: Execute real order
        if (userId) {
            await logger.warnForUser(userId, `🔥 LIVE ORDER: ${side} ${quantity.toFixed(6)} ${symbol} @ ~$${price.toFixed(2)}`);
        }

        let result;
        if (side === 'BUY') {
            // For BUY, we specify USD amount (quote_size)
            const usdAmount = quantity * price;
            result = await coinbaseTrader.placeMarketBuy(symbol, usdAmount, userId);
        } else {
            // For SELL, we specify asset amount (base_size)
            result = await coinbaseTrader.placeMarketSell(symbol, quantity, userId);
        }

        if (result.success) {
            if (userId) {
                await logger.successForUser(userId, `✅ LIVE ORDER PLACED: ${result.orderId}`);
            }
            return { ...result, orderType: 'LIVE' };
        } else {
            if (userId) {
                await logger.errorForUser(userId, `❌ LIVE ORDER FAILED: ${result.error}`);
            }
            return { ...result, orderType: 'FAILED' };
        }
    },

    /**
     * Execute trade for a specific user using their credentials
     * Multi-user version of executeTrade
     */
    async executeTradeForUser(userId: string, config: TradeConfig): Promise<TradeResult | null> {
        const { symbol, strategy, maxTradeSize } = config;

        // Load credentials for this specific user
        const credentialsLoaded = await coinbaseTrader.loadCredentialsForUser(userId);
        if (!credentialsLoaded) {
            logger.warn(`[ExecutionEngine] ⚠️ No credentials for user ${userId.slice(0, 8)} - skipping`);
            return null;
        }

        // Use existing executeTrade logic (with injected userId)
        return this.executeTrade({
            ...config,
            userId
        });
    },
};
