import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@coinbot/db';
import { rateLimit } from '@/lib/rate-limit';

// Utility to get IP for rate limiting
function getIP(req: NextRequest): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || '127.0.0.1';
}

// GET: Fetch current user's bot config
export async function GET(request: NextRequest) {
    try {
        const { success } = rateLimit(getIP(request), { limit: 100, windowMs: 60 * 1000 });
        if (!success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const configs = await prisma.botConfig.findMany({
            where: { userId: session.user.id },
            orderBy: { updatedAt: 'desc' },
        });

        // Return first active config or first config
        const config = configs.find(c => c.isActive) || configs[0] || null;

        return NextResponse.json({
            success: true,
            config,
        });
    } catch (error) {
        console.error('Error fetching bot config:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch config' },
            { status: 500 }
        );
    }
}

// PATCH: Update bot config (pair, isActive, etc.)
// When switching pairs, deactivate all others and activate the selected one
export async function PATCH(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = session.user.id;
        const body = await request.json();
        const {
            pair, isActive, isPaperTrading,
            // Risk
            maxDailyLoss, maxPositionSize, stopLossPct, takeProfitPct,
            // Strategy
            priceThresholdEnabled, buyBelowPrice, sellAbovePrice, buyAmountUsd, maxPositionUsd, sellPercentage,
            // Grid
            gridBuyingEnabled, gridDropPercent, gridMaxLayers,
            // RSI
            rsiFilterEnabled, rsiOversold,
            // Trailing Stop
            trailingStopEnabled, trailingStopTrigger, trailingStopDistance,
            // Other
            cooldownMinutes
        } = body;

        if (!pair) {
            return NextResponse.json(
                { success: false, error: 'Pair is required' },
                { status: 400 }
            );
        }

        // STOP CASE: If explicitly setting isActive to false, stop ALL bots for this user
        // This ensures the bot actually stops regardless of which pair is selected in the UI
        if (isActive === false) {
            // Deactivate ALL configs for this user to guarantee stop
            const result = await prisma.botConfig.updateMany({
                where: { userId },
                data: {
                    isActive: false,
                    currentSessionId: null
                },
            });

            console.log(`[BotConfig] User ${userId} STOPPED all bots (${result.count} config(s) deactivated)`);

            return NextResponse.json({
                success: true,
                stoppedCount: result.count,
                message: `All bots stopped (${result.count} config(s))`,
            });
        }

        // SETTINGS UPDATE CASE: isActive not specified - just update settings, DON'T change running state
        // This is triggered by SettingsPanel auto-save
        if (isActive === undefined) {
            const existingConfig = await prisma.botConfig.findUnique({
                where: { userId_pair: { userId, pair } },
            });

            if (existingConfig) {
                // Update settings WITHOUT changing isActive
                const config = await prisma.botConfig.update({
                    where: { userId_pair: { userId, pair } },
                    data: {
                        // DO NOT touch isActive or currentSessionId!
                        ...(isPaperTrading !== undefined && { isPaperTrading }),
                        // Risk
                        ...(maxDailyLoss !== undefined && { maxDailyLoss: new Decimal(maxDailyLoss) }),
                        ...(maxPositionSize !== undefined && { maxPositionSize: new Decimal(maxPositionSize) }),
                        ...(stopLossPct !== undefined && { stopLossPct: new Decimal(stopLossPct / 100) }),
                        ...(takeProfitPct !== undefined && { takeProfitPct: new Decimal(takeProfitPct / 100) }),
                        // Strategy
                        ...(priceThresholdEnabled !== undefined && { priceThresholdEnabled }),
                        ...(buyBelowPrice !== undefined && { buyBelowPrice: new Decimal(buyBelowPrice) }),
                        ...(sellAbovePrice !== undefined && { sellAbovePrice: new Decimal(sellAbovePrice) }),
                        ...(buyAmountUsd !== undefined && { buyAmountUsd: new Decimal(buyAmountUsd) }),
                        ...(maxPositionUsd !== undefined && { maxPositionUsd: new Decimal(maxPositionUsd) }),
                        ...(sellPercentage !== undefined && { sellPercentage }),
                        // Grid
                        ...(gridBuyingEnabled !== undefined && { gridBuyingEnabled }),
                        ...(gridDropPercent !== undefined && { gridDropPercent: new Decimal(gridDropPercent) }),
                        ...(gridMaxLayers !== undefined && { gridMaxLayers }),
                        // RSI
                        ...(rsiFilterEnabled !== undefined && { rsiFilterEnabled }),
                        ...(rsiOversold !== undefined && { rsiOversold }),
                        // Trailing Stop
                        ...(trailingStopEnabled !== undefined && { trailingStopEnabled }),
                        ...(trailingStopTrigger !== undefined && { trailingStopTrigger: new Decimal(trailingStopTrigger / 100) }),
                        ...(trailingStopDistance !== undefined && { trailingStopDistance: new Decimal(trailingStopDistance / 100) }),
                        // Other
                        ...(cooldownMinutes !== undefined && { cooldownMinutes }),
                    },
                });

                console.log(`[BotConfig] User ${userId} UPDATED settings for ${pair} (isActive unchanged: ${config.isActive})`);

                return NextResponse.json({
                    success: true,
                    config,
                    message: `Settings updated for ${pair}`,
                });
            } else {
                // No existing config - create one but DON'T activate (bot should remain stopped)
                const config = await prisma.botConfig.create({
                    data: {
                        userId,
                        pair,
                        isActive: false, // ← CRITICAL: New configs are INACTIVE by default
                        currentSessionId: null,
                        isPaperTrading: isPaperTrading ?? true,
                        maxDailyLoss: new Decimal(maxDailyLoss ?? 50.0),
                        maxPositionSize: new Decimal(maxPositionSize ?? 0.01),
                        riskPerTrade: new Decimal(0.01),
                        strategy: 'MOMENTUM',
                        interval: 15000, // 15 seconds - Coinbase allows 15 req/s
                    },
                });

                console.log(`[BotConfig] User ${userId} CREATED inactive config for ${pair}`);

                return NextResponse.json({
                    success: true,
                    config,
                    message: `Config created for ${pair} (inactive until Run clicked)`,
                });
            }
        }

        // START CASE: isActive === true - explicitly starting the bot
        // Deactivate ALL configs first, then activate the selected one
        await prisma.botConfig.updateMany({
            where: { userId },
            data: { isActive: false, currentSessionId: null },
        });

        // Find existing config by userId + pair or create new one
        const existingConfig = await prisma.botConfig.findUnique({
            where: { userId_pair: { userId, pair } },
        });

        // Generate new session ID when starting
        const newSessionId = crypto.randomUUID();

        let config;

        if (existingConfig) {
            // Update existing and activate
            config = await prisma.botConfig.update({
                where: { userId_pair: { userId, pair } },
                data: {
                    isActive: true, // Always true for start/update
                    currentSessionId: newSessionId,
                    ...(isPaperTrading !== undefined && { isPaperTrading }),
                    // Risk
                    ...(maxDailyLoss !== undefined && { maxDailyLoss: new Decimal(maxDailyLoss) }),
                    ...(maxPositionSize !== undefined && { maxPositionSize: new Decimal(maxPositionSize) }),
                    ...(stopLossPct !== undefined && { stopLossPct: new Decimal(stopLossPct / 100) }),
                    ...(takeProfitPct !== undefined && { takeProfitPct: new Decimal(takeProfitPct / 100) }),
                    // Strategy
                    ...(priceThresholdEnabled !== undefined && { priceThresholdEnabled }),
                    ...(buyBelowPrice !== undefined && { buyBelowPrice: new Decimal(buyBelowPrice) }),
                    ...(sellAbovePrice !== undefined && { sellAbovePrice: new Decimal(sellAbovePrice) }),
                    ...(buyAmountUsd !== undefined && { buyAmountUsd: new Decimal(buyAmountUsd) }),
                    ...(maxPositionUsd !== undefined && { maxPositionUsd: new Decimal(maxPositionUsd) }),
                    ...(sellPercentage !== undefined && { sellPercentage }),
                    // Grid
                    ...(gridBuyingEnabled !== undefined && { gridBuyingEnabled }),
                    ...(gridDropPercent !== undefined && { gridDropPercent: new Decimal(gridDropPercent) }),
                    ...(gridMaxLayers !== undefined && { gridMaxLayers }),
                    // RSI
                    ...(rsiFilterEnabled !== undefined && { rsiFilterEnabled }),
                    ...(rsiOversold !== undefined && { rsiOversold }),
                    // Trailing Stop
                    ...(trailingStopEnabled !== undefined && { trailingStopEnabled }),
                    ...(trailingStopTrigger !== undefined && { trailingStopTrigger: new Decimal(trailingStopTrigger / 100) }),
                    ...(trailingStopDistance !== undefined && { trailingStopDistance: new Decimal(trailingStopDistance / 100) }),
                    // Other
                    ...(cooldownMinutes !== undefined && { cooldownMinutes }),
                },
            });
        } else {
            // Create new config for this user + pair - active by default
            config = await prisma.botConfig.create({
                data: {
                    userId,
                    pair,
                    isActive: true,
                    currentSessionId: newSessionId,
                    isPaperTrading: isPaperTrading ?? true, // Default to paper mode
                    maxDailyLoss: new Decimal(maxDailyLoss ?? 50.0),
                    maxPositionSize: new Decimal(maxPositionSize ?? 0.01),
                    riskPerTrade: new Decimal(0.01),
                    strategy: 'MOMENTUM',
                    interval: 15000, // 15 seconds - Coinbase allows 15 req/s
                },
            });
        }

        console.log(`[BotConfig] User ${userId} STARTED bot for ${pair}: isActive=${config.isActive}`);

        return NextResponse.json({
            success: true,
            config,
            message: `Bot started for ${pair}`,
        });
    } catch (error) {
        console.error('Error updating bot config:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update config' },
            { status: 500 }
        );
    }
}

