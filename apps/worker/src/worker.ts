/**
 * worker.ts - Multi-User Coinbase Trading Bot Runner
 * 
 * This worker runs indefinitely in a Docker container, continuously:
 * 1. Finding ALL users with active BotConfigs
 * 2. For each user, loading their API credentials
 * 3. Executing trading strategies independently per user
 * 4. Logging trades to the database with userId
 */

import { Decimal } from '@coinbot/db';
import { prisma } from './lib/prisma';
import { executionEngine } from './executionEngine';
import { riskManager } from './RiskManager';
import { logger } from './logger';
import { coinbaseTrader } from './CoinbaseTrader';
import { marketDataService } from './MarketDataService';
import crypto from 'crypto';

let isShuttingDown = false;

/**
 * Sleep utility for async delays
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Initialize database connection
 */
async function initializeDatabase(): Promise<void> {
    logger.info('🔌 Initializing database connection...');

    try {
        await prisma.$connect();
        logger.success('✅ Database connected successfully');

        // SAFETY RESET: Deactivate all bots on worker startup
        // Users must explicitly click "Run" to start their bot
        const deactivated = await prisma.botConfig.updateMany({
            where: { isActive: true },
            data: { isActive: false, currentSessionId: null },
        });
        if (deactivated.count > 0) {
            logger.warn(`🛑 Safety reset: Deactivated ${deactivated.count} stale bot config(s)`);
        }
    } catch (error) {
        logger.error(`❌ Database initialization failed: ${error}`);
        throw error;
    }
}

/**
 * Process a single user's trading cycle
 * Executes trades using the user's own API credentials
 */
async function processUserTrade(
    userId: string,
    config: {
        pair: string;
        strategy: string;
        maxPositionSize: Decimal;
        interval: number;
        isPaperTrading: boolean;
        stopLossPct: Decimal;
        takeProfitPct: Decimal;
        // Price Threshold
        priceThresholdEnabled: boolean;
        buyBelowPrice: Decimal;
        sellAbovePrice: Decimal;
        buyAmountUsd: Decimal;
        sellPercentage: number;
        // Grid
        gridBuyingEnabled: boolean;
        gridDropPercent: Decimal;
        gridMaxLayers: number;
        // RSI
        rsiFilterEnabled: boolean;
        rsiOversold: number;
        // Trailing Stop
        trailingStopEnabled: boolean;
        trailingStopTrigger: Decimal;
        trailingStopDistance: Decimal;
        // Other
        cooldownMinutes: number;
        // Session
        currentSessionId: string | null;
    }
): Promise<void> {
    const PAIR = config.pair;

    try {
        // RE-CHECK: User may have stopped bot during previous cycle
        const currentConfig = await prisma.botConfig.findUnique({
            where: { userId_pair: { userId, pair: PAIR } },
            select: { isActive: true },
        });
        if (!currentConfig?.isActive) {
            logger.infoForUser(userId, `User ${userId.slice(0, 8)} stopped bot - skipping cycle`);
            return;
        }

        // Log for this user
        await logger.infoForUser(userId, `Running trading cycle for ${PAIR}...`);

        // Risk check
        const riskCheck = await riskManager.canTrade(PAIR);
        if (!riskCheck.allowed) {
            await logger.warnForUser(userId, `RiskManager blocked: ${riskCheck.reason}`);
            return;
        }

        // --- NEW: Position Management (SL/TP Check) ---
        const baseAsset = PAIR.split('-')[0]; // e.g., "BTC" from "BTC-USDC"
        const balance = await coinbaseTrader.getAssetBalance(baseAsset);
        const currentPrice = await marketDataService.getCurrentPrice(PAIR);

        if (currentPrice && balance.total > 0) {
            const positionValue = balance.total * currentPrice;
            const DUST_LIMIT_USD = 10; // Below $10 is dust, ignore

            if (positionValue > DUST_LIMIT_USD) {
                await logger.infoForUser(userId, `📍 Active position: ${balance.total.toFixed(6)} ${baseAsset} (~$${positionValue.toFixed(2)})`);

                // Calculate WEIGHTED AVERAGE entry price from all BUY trades
                const allBuys = await prisma.tradeLog.findMany({
                    where: { userId, pair: PAIR, side: 'BUY', status: 'FILLED' },
                    select: { executionPrice: true, filledSize: true },
                });

                let avgEntryPrice = currentPrice;
                if (allBuys.length > 0) {
                    let totalCost = 0;
                    let totalQty = 0;
                    for (const buy of allBuys) {
                        const price = buy.executionPrice?.toNumber() || 0;
                        const qty = buy.filledSize?.toNumber() || 0;
                        totalCost += price * qty;
                        totalQty += qty;
                    }
                    avgEntryPrice = totalQty > 0 ? totalCost / totalQty : currentPrice;
                }

                // Get SL/TP from DATABASE CONFIG
                const stopLossPct = config.stopLossPct.toNumber();
                const takeProfitPct = config.takeProfitPct.toNumber();

                // SL/TP check (using config values)
                const manageResult = await executionEngine.managePosition(
                    userId,
                    PAIR,
                    currentPrice,
                    avgEntryPrice,
                    balance.total,
                    stopLossPct,
                    takeProfitPct,
                    config.isPaperTrading
                );

                if (manageResult.closed) {
                    await logger.successForUser(userId, `Position closed via ${manageResult.reason}`);

                    // LOG THE SELL TRADE TO DATABASE with P/L calculation
                    const sellPrice = currentPrice;
                    const sellQty = balance.total;
                    const estimatedFee = sellPrice * sellQty * 0.006; // 0.6% fee estimate
                    const totalSellValue = sellPrice * sellQty;
                    const totalBuyCost = avgEntryPrice * sellQty;
                    const realizedPnL = (totalSellValue - totalBuyCost) - estimatedFee;
                    const pnlPercent = ((sellPrice - avgEntryPrice) / avgEntryPrice) * 100;

                    await prisma.tradeLog.create({
                        data: {
                            userId,
                            pair: PAIR,
                            side: 'SELL',
                            status: 'FILLED',
                            expectedPrice: new Decimal(sellPrice),
                            expectedQuantity: new Decimal(sellQty),
                            expectedFee: new Decimal(estimatedFee),
                            expectedSlippage: new Decimal(0),
                            expectedCost: new Decimal(totalSellValue),
                            breakEvenPrice: new Decimal(avgEntryPrice),
                            executionPrice: new Decimal(sellPrice),
                            executionFee: new Decimal(estimatedFee),
                            filledSize: new Decimal(sellQty),
                            actualCost: new Decimal(totalSellValue),
                            realizedPnL: new Decimal(realizedPnL),
                            clientOrderId: crypto.randomUUID(),
                            strategy: config.strategy,
                            notes: `${manageResult.reason} | Entry: $${avgEntryPrice.toFixed(2)} | P/L: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`,
                            sessionId: config.currentSessionId,
                        },
                    });

                    await logger.infoForUser(userId, `📊 Logged SELL: ${sellQty.toFixed(6)} ${baseAsset} @ $${sellPrice.toFixed(2)} | P/L: $${realizedPnL.toFixed(2)}`);

                    // Clear active position record on close
                    await prisma.activePosition.deleteMany({ where: { userId, pair: PAIR } });
                    return; // Done for this cycle
                }

                // --- FULL TRAILING STOP with Persistent State ---
                if (config.trailingStopEnabled) {
                    const profitPct = ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100;
                    const triggerPct = config.trailingStopTrigger.toNumber() * 100;
                    const distancePct = config.trailingStopDistance.toNumber() * 100;

                    // Get or create active position record
                    let position = await prisma.activePosition.findUnique({
                        where: { userId_pair: { userId, pair: PAIR } },
                    });

                    if (!position) {
                        position = await prisma.activePosition.create({
                            data: {
                                userId,
                                pair: PAIR,
                                quantity: new Decimal(balance.total),
                                avgEntryPrice: new Decimal(avgEntryPrice),
                                highestPrice: new Decimal(currentPrice),
                                trailingActive: false,
                                gridLayer: 0,
                                gridBasePrice: new Decimal(avgEntryPrice),
                            },
                        });
                    }

                    const highestPrice = position.highestPrice.toNumber();
                    const trailingActive = position.trailingActive;

                    // Update highest price if current is higher
                    if (currentPrice > highestPrice) {
                        await prisma.activePosition.update({
                            where: { userId_pair: { userId, pair: PAIR } },
                            data: { highestPrice: new Decimal(currentPrice) },
                        });
                    }

                    // Check if trail should activate
                    if (profitPct >= triggerPct && !trailingActive) {
                        await prisma.activePosition.update({
                            where: { userId_pair: { userId, pair: PAIR } },
                            data: { trailingActive: true, highestPrice: new Decimal(currentPrice) },
                        });
                        await logger.infoForUser(userId, `📈 TRAILING STOP ACTIVATED at +${profitPct.toFixed(1)}%! Highest: $${currentPrice.toFixed(2)}`);
                    }

                    // If trail is active, check if we should sell
                    if (trailingActive) {
                        const dropFromHigh = ((highestPrice - currentPrice) / highestPrice) * 100;
                        await logger.infoForUser(userId, `📈 Trailing: High $${highestPrice.toFixed(2)}, Now $${currentPrice.toFixed(2)} (-${dropFromHigh.toFixed(1)}%)`);

                        if (dropFromHigh >= distancePct) {
                            await logger.warnForUser(userId, `🎯 TRAILING STOP HIT! Dropped ${dropFromHigh.toFixed(1)}% from peak. SELLING!`);
                            const sellResult = await executionEngine.managePosition(
                                userId, PAIR, currentPrice, avgEntryPrice, balance.total,
                                1.0, 0, config.isPaperTrading // Force sell with 100% "SL" trigger
                            );
                            if (sellResult.closed) {
                                // LOG THE TRAILING STOP SELL TO DATABASE with P/L calculation
                                const sellPrice = currentPrice;
                                const sellQty = balance.total;
                                const estimatedFee = sellPrice * sellQty * 0.006; // 0.6% fee estimate
                                const totalSellValue = sellPrice * sellQty;
                                const totalBuyCost = avgEntryPrice * sellQty;
                                const realizedPnL = (totalSellValue - totalBuyCost) - estimatedFee;
                                const pnlPercent = ((sellPrice - avgEntryPrice) / avgEntryPrice) * 100;

                                await prisma.tradeLog.create({
                                    data: {
                                        userId,
                                        pair: PAIR,
                                        side: 'SELL',
                                        status: 'FILLED',
                                        expectedPrice: new Decimal(sellPrice),
                                        expectedQuantity: new Decimal(sellQty),
                                        expectedFee: new Decimal(estimatedFee),
                                        expectedSlippage: new Decimal(0),
                                        expectedCost: new Decimal(totalSellValue),
                                        breakEvenPrice: new Decimal(avgEntryPrice),
                                        executionPrice: new Decimal(sellPrice),
                                        executionFee: new Decimal(estimatedFee),
                                        filledSize: new Decimal(sellQty),
                                        actualCost: new Decimal(totalSellValue),
                                        realizedPnL: new Decimal(realizedPnL),
                                        clientOrderId: crypto.randomUUID(),
                                        strategy: 'TRAILING_STOP',
                                        notes: `Trailing Stop (${dropFromHigh.toFixed(1)}% drop from $${highestPrice.toFixed(2)}) | Entry: $${avgEntryPrice.toFixed(2)} | P/L: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`,
                                        sessionId: config.currentSessionId,
                                    },
                                });

                                await logger.infoForUser(userId, `📊 Logged SELL: ${sellQty.toFixed(6)} ${baseAsset} @ $${sellPrice.toFixed(2)} | P/L: $${realizedPnL.toFixed(2)}`);

                                await prisma.activePosition.deleteMany({ where: { userId, pair: PAIR } });
                                await logger.successForUser(userId, `Position closed via Trailing Stop at $${currentPrice.toFixed(2)}`);
                                return;
                            }
                        }
                    }
                }

                // Position exists but no exit triggered -> continue to check for Grid DCA
            }
        }
        // --- END Position Management ---

        // --- GRID DCA BUYING ---
        if (config.gridBuyingEnabled && currentPrice) {
            // Get or create active position for grid tracking
            let position = await prisma.activePosition.findUnique({
                where: { userId_pair: { userId, pair: PAIR } },
            });

            const gridDropPct = config.gridDropPercent.toNumber();
            const maxLayers = config.gridMaxLayers;

            if (position) {
                const basePrice = position.gridBasePrice.toNumber();
                const currentLayer = position.gridLayer;

                // Calculate next grid layer price
                const nextLayerPrice = basePrice * (1 - gridDropPct / 100 * (currentLayer + 1));

                if (currentPrice <= nextLayerPrice && currentLayer < maxLayers) {
                    await logger.infoForUser(userId, `📊 GRID DCA Layer ${currentLayer + 1}: Price $${currentPrice.toFixed(2)} hit layer price $${nextLayerPrice.toFixed(2)}`);

                    // Execute DCA buy
                    const dcaAmount = config.buyAmountUsd.toNumber();
                    const tradeResult = await executionEngine.executeTradeForUser(userId, {
                        symbol: PAIR,
                        strategy: 'GRID_DCA',
                        riskLevel: 'MEDIUM',
                        maxTradeSize: dcaAmount,
                        stopLoss: config.stopLossPct.toNumber(),
                        takeProfit: config.takeProfitPct.toNumber(),
                        isPaperTrading: config.isPaperTrading,
                        userId,
                    });

                    if (tradeResult?.executed) {
                        // Update grid layer
                        await prisma.activePosition.update({
                            where: { userId_pair: { userId, pair: PAIR } },
                            data: { gridLayer: currentLayer + 1 },
                        });
                        await logger.successForUser(userId, `Grid DCA Layer ${currentLayer + 1} executed at $${currentPrice.toFixed(2)}`);
                        return;
                    }
                }
            }
        }
        // --- END GRID DCA ---

        // --- PRICE THRESHOLD FILTER ---
        if (config.priceThresholdEnabled && currentPrice) {
            const buyBelow = config.buyBelowPrice.toNumber();

            if (currentPrice > buyBelow) {
                await logger.infoForUser(userId, `⏸️ Price Threshold: $${currentPrice.toFixed(0)} > $${buyBelow.toFixed(0)} (Buy Below). Waiting...`);
                return; // Don't buy, price too high
            }
        }
        // --- END PRICE THRESHOLD ---

        // Execute trade using user's credentials
        const maxTradeSize = config.buyAmountUsd.toNumber(); // Use config buyAmountUsd instead of calculation

        const tradeResult = await executionEngine.executeTradeForUser(userId, {
            symbol: PAIR,
            strategy: config.strategy,
            riskLevel: 'MEDIUM',
            maxTradeSize: maxTradeSize,
            stopLoss: config.stopLossPct.toNumber(),
            takeProfit: config.takeProfitPct.toNumber(),
            isPaperTrading: config.isPaperTrading,
            userId: userId,
            // Pass RSI settings to execution engine
            rsiFilterEnabled: config.rsiFilterEnabled,
            rsiOversold: config.rsiOversold,
        });

        // Log trade to database if executed
        if (tradeResult && tradeResult.executed) {
            // Use the orderId from the exchange/paper, or generate a UUID as fallback
            const clientOrderId = tradeResult.orderId || crypto.randomUUID();
            const tradeMode = tradeResult.isPaperTrade ? 'PAPER' : 'LIVE';

            const tradeLog = await prisma.tradeLog.create({
                data: {
                    userId, // Log trade for specific user
                    pair: tradeResult.symbol,
                    side: tradeResult.action,
                    status: 'FILLED',

                    expectedPrice: new Decimal(tradeResult.price),
                    expectedQuantity: new Decimal(tradeResult.amount),
                    expectedFee: new Decimal(tradeResult.fee),
                    expectedSlippage: new Decimal(0),
                    expectedCost: new Decimal(tradeResult.totalCost),
                    breakEvenPrice: new Decimal(tradeResult.costBreakdown?.breakEvenPrice || tradeResult.price),

                    executionPrice: new Decimal(tradeResult.price),
                    executionFee: new Decimal(tradeResult.fee),
                    filledSize: new Decimal(tradeResult.amount),
                    actualCost: new Decimal(tradeResult.totalCost),

                    clientOrderId,
                    strategy: config.strategy,
                    notes: `[${tradeMode}] ${tradeResult.notes || ''}`.trim(),
                    sessionId: config.currentSessionId,
                },
            });

            await logger.successForUser(userId, `[${tradeMode}] Trade logged: ${tradeLog.side} ${tradeLog.expectedQuantity} ${tradeLog.pair} @ $${tradeLog.expectedPrice}`);
        } else {
            await logger.infoForUser(userId, 'No trade executed this cycle');
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await logger.errorForUser(userId, `Trade error: ${errorMessage}`);
    }
}

/**
 * Main trading loop
 * Finds ALL active user configs and processes each in parallel
 */
async function startBot(): Promise<void> {
    logger.info('🤖 Starting Multi-User Coinbase Trading Bot...\n');

    await initializeDatabase();

    while (!isShuttingDown) {
        try {
            // Find ALL active bot configs across all users
            const activeConfigs = await prisma.botConfig.findMany({
                where: { isActive: true },
            });

            if (activeConfigs.length === 0) {
                // Idle mode - poll every 10s for quick response when user clicks Run
                await sleep(10000); // 10 seconds
                continue;
            }

            logger.info(`\n👥 Processing ${activeConfigs.length} active user(s)...`);

            // Process all users in parallel
            const tradePromises = activeConfigs.map(async (config) => {
                // Verify user has valid credentials
                const credentials = await prisma.apiCredentials.findFirst({
                    where: { userId: config.userId, isActive: true },
                });

                if (!credentials) {
                    await logger.warnForUser(config.userId, 'No valid API credentials found');
                    return;
                }

                // Process trade for this user
                await processUserTrade(config.userId, {
                    pair: config.pair,
                    strategy: config.strategy,
                    maxPositionSize: config.maxPositionSize,
                    interval: config.interval,
                    isPaperTrading: config.isPaperTrading,
                    stopLossPct: config.stopLossPct,
                    takeProfitPct: config.takeProfitPct,
                    // Price Threshold
                    priceThresholdEnabled: config.priceThresholdEnabled,
                    buyBelowPrice: config.buyBelowPrice,
                    sellAbovePrice: config.sellAbovePrice,
                    buyAmountUsd: config.buyAmountUsd,
                    sellPercentage: config.sellPercentage,
                    // Grid
                    gridBuyingEnabled: config.gridBuyingEnabled,
                    gridDropPercent: config.gridDropPercent,
                    gridMaxLayers: config.gridMaxLayers,
                    // RSI
                    rsiFilterEnabled: config.rsiFilterEnabled,
                    rsiOversold: config.rsiOversold,
                    // Trailing Stop
                    trailingStopEnabled: config.trailingStopEnabled,
                    trailingStopTrigger: config.trailingStopTrigger,
                    trailingStopDistance: config.trailingStopDistance,
                    // Other
                    cooldownMinutes: config.cooldownMinutes,
                    // Session
                    currentSessionId: config.currentSessionId,
                });
            });

            await Promise.all(tradePromises);

            // Wait for next cycle (use shortest interval among active configs)
            const minInterval = Math.min(...activeConfigs.map(c => c.interval));
            await sleep(minInterval);

        } catch (error) {
            logger.error(`❌ Error in trading loop: ${error instanceof Error ? error.message : String(error)}`);
            await sleep(5000);
        }
    }

    logger.info('🛑 Trading loop stopped');
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
        logger.warn('⚠️  Shutdown already in progress...');
        return;
    }

    logger.info(`\n📡 Received ${signal} signal`);
    logger.info('🛑 Initiating graceful shutdown...');

    isShuttingDown = true;

    try {
        logger.info('⏳ Waiting for pending operations...');
        await sleep(2000);

        logger.info('🔌 Closing database connection...');
        await prisma.$disconnect();

        logger.success('✅ Graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        logger.error(`❌ Error during shutdown: ${error}`);
        process.exit(1);
    }
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason, promise) => {
    logger.error(`❌ Unhandled Rejection at: ${promise}, reason: ${reason}`);
    gracefulShutdown('UNHANDLED_REJECTION');
});
process.on('uncaughtException', (error) => {
    logger.error(`❌ Uncaught Exception: ${error}`);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Start the bot
if (require.main === module) {
    startBot().catch((error) => {
        logger.error(`❌ Fatal error starting bot: ${error}`);
        process.exit(1);
    });
}

export { startBot, initializeDatabase };
