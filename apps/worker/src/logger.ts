/**
 * logger.ts - Multi-User Database Logger for Worker
 * 
 * Writes logs to database so dashboard can display them
 * Supports userId for multi-user isolation
 */

import { prisma } from './lib/prisma';

type LogLevel = 'info' | 'warn' | 'error' | 'success';

/**
 * Log to both console and database
 * @param level - Log level
 * @param message - Log message
 * @param source - Log source (worker, trade, system)
 * @param userId - Optional user ID for multi-user isolation
 */
async function log(level: LogLevel, message: string, source = 'worker', userId?: string) {
    // Console log first (always works)
    const prefix = {
        info: '📋',
        warn: '⚠️',
        error: '❌',
        success: '✅',
    }[level];

    const userTag = userId ? `[${userId.slice(0, 8)}]` : '[SYSTEM]';
    console.log(`${prefix} ${userTag} ${message}`);

    // Write to database (async, don't await)
    prisma.systemLog.create({
        data: {
            userId: userId || null,
            level,
            source,
            message,
        },
    }).catch((err) => {
        // Silently fail - don't break the worker
        console.error('Failed to write log to DB:', err.message);
    });
}

export const logger = {
    // System-wide logs (no userId)
    info: (message: string, source = 'worker') => log('info', message, source),
    warn: (message: string, source = 'worker') => log('warn', message, source),
    error: (message: string, source = 'worker') => log('error', message, source),
    success: (message: string, source = 'worker') => log('success', message, source),

    // Log trade activity
    trade: (message: string) => log('info', message, 'trade'),

    // Log system events
    system: (message: string) => log('info', message, 'system'),

    // User-specific logs (with userId for multi-user isolation)
    infoForUser: (userId: string, message: string, source = 'worker') => log('info', message, source, userId),
    warnForUser: (userId: string, message: string, source = 'worker') => log('warn', message, source, userId),
    errorForUser: (userId: string, message: string, source = 'worker') => log('error', message, source, userId),
    successForUser: (userId: string, message: string, source = 'worker') => log('success', message, source, userId),
};
