import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';

function getIP(req: NextRequest): string {
    return req.headers.get('x-forwarded-for') || req.ip || '127.0.0.1';
}

/**
 * DELETE - Reset system logs for the current user
 */
export async function DELETE(request: NextRequest) {
    try {
        const { success } = rateLimit(getIP(request), { limit: 20, windowMs: 60 * 1000 });
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

        const userId = session.user.id;

        // ONLY Delete system logs for this user (preserves trades and positions)
        const deletedLogs = await prisma.systemLog.deleteMany({
            where: { userId },
        });

        console.log(`[Reset] User ${userId} cleared ${deletedLogs.count} system logs`);

        return NextResponse.json({
            success: true,
            message: 'Worker logs cleared',
            deletedLogs: deletedLogs.count,
        });
    } catch (error) {
        console.error('Error resetting data:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to reset data' },
            { status: 500 }
        );
    }
}
