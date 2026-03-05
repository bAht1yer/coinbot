import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';

function getIP(req: NextRequest): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || '127.0.0.1';
}

// GET: Fetch recent trades for the user
export async function GET(request: NextRequest) {
    try {
        const { success } = rateLimit(getIP(request), { limit: 200, windowMs: 60 * 1000 });
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

        const url = new URL(request.url);
        const limit = parseInt(url.searchParams.get('limit') || '50');

        const trades = await prisma.tradeLog.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        // Transform to match frontend TradeLogEntry interface
        const formattedTrades = trades.map(t => ({
            id: t.id,
            pair: t.pair,
            product: t.pair, // Frontend uses 'product'
            side: t.side,
            price: t.executionPrice?.toNumber() || t.expectedPrice.toNumber(),
            quantity: t.filledSize?.toNumber() || t.expectedQuantity.toNumber(),
            status: t.status,
            time: t.createdAt,
            orderId: t.clientOrderId, // Required by frontend type
            realizedPnl: t.realizedPnL?.toNumber(),
            pnlPercent: t.realizedPnL && (t.actualCost || t.expectedCost)
                ? (t.realizedPnL.toNumber() / (t.actualCost?.toNumber() || t.expectedCost.toNumber())) * 100
                : undefined,
            notes: t.notes,
            sessionId: t.sessionId, // Session this trade belongs to
        }));

        return NextResponse.json({
            success: true,
            trades: formattedTrades
        });
    } catch (error) {
        console.error('Error fetching trades:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch trades' },
            { status: 500 }
        );
    }
}
