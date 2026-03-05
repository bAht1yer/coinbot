import { NextRequest, NextResponse } from 'next/server';
import { coinbaseClient } from '@/lib/coinbase';

// Public Exchange API - no auth required for USD pairs
const EXCHANGE_API = 'https://api.exchange.coinbase.com';

// USDC pairs need authenticated Brokerage API
const USDC_PAIRS = ['BTC-USDC', 'ETH-USDC', 'SOL-USDC'];

// Map granularity names to seconds for Exchange API
const GRANULARITY_MAP: Record<string, number> = {
    'ONE_MINUTE': 60,
    'FIVE_MINUTE': 300,
    'FIFTEEN_MINUTE': 900,
    'THIRTY_MINUTE': 1800,
    'ONE_HOUR': 3600,
    'TWO_HOUR': 7200,
    'SIX_HOUR': 21600,
    'ONE_DAY': 86400,
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ product: string }> }
) {
    const { product } = await params;
    const searchParams = request.nextUrl.searchParams;
    const granularity = searchParams.get('granularity') || 'FIFTEEN_MINUTE';
    const limit = parseInt(searchParams.get('limit') || '100');

    // Check if this is a USDC pair that needs authenticated API
    const isUsdcPair = USDC_PAIRS.some(p => product.endsWith('-USDC'));

    if (isUsdcPair) {
        // Use authenticated Brokerage API for USDC pairs
        if (!coinbaseClient.hasCredentials()) {
            return NextResponse.json(
                { error: 'USDC pairs require API credentials. Please configure your API key.' },
                { status: 401 }
            );
        }

        try {
            const response = await coinbaseClient.getCandles(product, granularity, limit);

            const candles = response.candles.map((c: any) => ({
                time: parseInt(c.start),
                open: parseFloat(c.open),
                high: parseFloat(c.high),
                low: parseFloat(c.low),
                close: parseFloat(c.close),
                volume: parseFloat(c.volume),
            }));

            candles.sort((a: any, b: any) => a.time - b.time);

            return NextResponse.json({ candles });
        } catch (error) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Failed to fetch candles' },
                { status: 500 }
            );
        }
    }

    // Use public Exchange API for USD pairs (no auth required)
    const granularitySeconds = GRANULARITY_MAP[granularity] || 900;

    try {
        const response = await fetch(
            `${EXCHANGE_API}/products/${product}/candles?granularity=${granularitySeconds}`,
            {
                headers: { 'Content-Type': 'application/json' },
                next: { revalidate: 60 },
            }
        );

        if (!response.ok) {
            throw new Error(`Exchange API error: ${response.status}`);
        }

        const rawCandles = await response.json() as number[][];

        const candles = rawCandles
            .slice(0, limit)
            .map((c: number[]) => ({
                time: c[0],
                low: c[1],
                high: c[2],
                open: c[3],
                close: c[4],
                volume: c[5],
            }))
            .sort((a, b) => a.time - b.time);

        return NextResponse.json({ candles });
    } catch (error) {
        console.error('Candles fetch error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch candles' },
            { status: 500 }
        );
    }
}
