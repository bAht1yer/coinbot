/**
 * Simple in-memory rate limiter for single-instance Next.js deployments.
 * Uses a Map to track request counts and timestamps per IP.
 */

type Rule = {
    limit: number;
    windowMs: number;
};

const cache = new Map<string, { count: number; expiresAt: number }>();

export function rateLimit(ip: string, { limit, windowMs }: Rule): { success: boolean; limit: number; remaining: number; reset: number } {
    const now = Date.now();
    const key = `rl_${ip}`;

    // Cleanup expired entries occasionally to prevent memory leaks in dev
    if (Math.random() < 0.1) {
        for (const [k, v] of cache.entries()) {
            if (now > v.expiresAt) {
                cache.delete(k);
            }
        }
    }

    let record = cache.get(key);

    if (!record || now > record.expiresAt) {
        // First request or window expired
        record = { count: 1, expiresAt: now + windowMs };
        cache.set(key, record);
        return { success: true, limit, remaining: limit - 1, reset: record.expiresAt };
    }

    // Existing record in active window
    if (record.count >= limit) {
        return { success: false, limit, remaining: 0, reset: record.expiresAt };
    }

    record.count += 1;
    return { success: true, limit, remaining: limit - record.count, reset: record.expiresAt };
}
