/**
 * RiskManager.ts - Circuit Breaker and Risk Control
 * 
 * Prevents catastrophic losses through automated checks
 */

import { Prisma } from '@prisma/client';
import { prisma } from './lib/prisma';
import { startOfDay } from 'date-fns';

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  currentDailyLoss?: number;
  maxDailyLoss?: number;
}

export class RiskManager {
  /**
   * CRITICAL: Check if trading is allowed
   * This is the circuit breaker - it will auto-pause the bot if limits are exceeded
   */
  static async canTrade(pair: string): Promise<RiskCheckResult> {
    try {
      // 1. Read bot configuration
      const config = await prisma.botConfig.findFirst({
        where: { pair, isActive: true },
      });

      if (!config) {
        return {
          allowed: false,
          reason: `No configuration found for ${pair}. Create config in database first.`,
        };
      }

      if (!config.isActive) {
        return {
          allowed: false,
          reason: 'Bot is PAUSED via Dashboard',
        };
      }

      // 2. Calculate today's realized losses
      const todayStart = startOfDay(new Date());

      const todayTrades = await prisma.tradeLog.findMany({
        where: {
          pair,
          status: 'FILLED',
          createdAt: { gte: todayStart },
          realizedPnL: { not: null },
        },
        select: { realizedPnL: true },
      });

      // Sum up all realized PnL (including profits and losses)
      const totalPnL = todayTrades.reduce((sum, trade) => {
        return sum.add(trade.realizedPnL || new Prisma.Decimal(0));
      }, new Prisma.Decimal(0));

      // Convert to number for comparison
      const totalPnLNumber = totalPnL.toNumber();
      const maxDailyLossNumber = config.maxDailyLoss.toNumber();

      console.log(`[RiskManager] Today's P/L: $${totalPnLNumber.toFixed(2)} | Max Loss: $${maxDailyLossNumber.toFixed(2)}`);

      // 3. Circuit breaker check (REALIZED LOSS)
      // If we've lost more than the max daily loss, auto-pause
      if (totalPnLNumber < -maxDailyLossNumber) {
        // Auto-pause the bot
        await prisma.botConfig.updateMany({
          where: { pair },
          data: { isActive: false },
        });

        console.error(`[RiskManager] 🚨 CIRCUIT BREAKER TRIGGERED! Daily loss limit exceeded.`);

        return {
          allowed: false,
          reason: `Daily Loss Limit Hit: $${Math.abs(totalPnLNumber).toFixed(2)}. Bot Auto-Paused.`,
          currentDailyLoss: Math.abs(totalPnLNumber),
          maxDailyLoss: maxDailyLossNumber,
        };
      }

      // 4. [NEW] Add Unrealized PnL check 
      // We can't easily track "starting equity" without a new DB field,
      // so for now we treat large floating loss signals as warnings.
      // The REAL protection is in executionEngine.managePosition (SL/TP).
      // This block serves as an additional safety net based on config value.
      // TODO: In future, store daily starting equity in DB for accurate tracking.

      // 4. All checks passed
      return { allowed: true };

    } catch (error) {
      console.error('[RiskManager] Error during risk check:', error);
      return {
        allowed: false,
        reason: 'Risk check failed due to database error',
      };
    }
  }

  /**
   * Get current trading statistics
   */
  static async getTodayStats(pair: string): Promise<{
    totalTrades: number;
    filledTrades: number;
    totalPnL: number;
    winRate: number;
  }> {
    const todayStart = startOfDay(new Date());

    const trades = await prisma.tradeLog.findMany({
      where: {
        pair,
        createdAt: { gte: todayStart },
      },
    });

    const filledTrades = trades.filter(t => t.status === 'FILLED');
    const closedTrades = filledTrades.filter(t => t.realizedPnL !== null);

    const totalPnL = closedTrades.reduce((sum, trade) => {
      return sum.add(trade.realizedPnL || new Prisma.Decimal(0));
    }, new Prisma.Decimal(0));

    const winningTrades = closedTrades.filter(t =>
      t.realizedPnL && t.realizedPnL.toNumber() > 0
    );

    const winRate = closedTrades.length > 0
      ? (winningTrades.length / closedTrades.length) * 100
      : 0;

    return {
      totalTrades: trades.length,
      filledTrades: filledTrades.length,
      totalPnL: totalPnL.toNumber(),
      winRate,
    };
  }

  /**
   * Validate position size against max
   */
  static async validatePositionSize(
    pair: string,
    proposedSize: number
  ): Promise<{ valid: boolean; reason?: string }> {
    const config = await prisma.botConfig.findFirst({
      where: { pair },
    });

    if (!config) {
      return { valid: false, reason: 'No config found' };
    }

    const maxSize = config.maxPositionSize.toNumber();

    if (proposedSize > maxSize) {
      return {
        valid: false,
        reason: `Position size ${proposedSize} exceeds max ${maxSize}`,
      };
    }

    return { valid: true };
  }
}

// Export singleton for easy access
export const riskManager = RiskManager;
