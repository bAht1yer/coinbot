import { NextRequest, NextResponse } from 'next/server';
import { coinbaseClient } from '@/lib/coinbase';

// Public Exchange API - no auth required for USD pairs
const EXCHANGE_API = 'https://api.exchange.coinbase.com';

// USDC pairs need authenticated Brokerage API
const USDC_PAIRS = ['BTC-USDC', 'ETH-USDC', 'SOL-USDC'];

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ product: string }> }
) {
    const { product } = await params;

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
            const response = await coinbaseClient.getTicker(product);

            const bestBid = parseFloat(response.best_bid || '0');
            const bestAsk = parseFloat(response.best_ask || '0');
            const lastPrice = response.trades?.[0]?.price
                ? parseFloat(response.trades[0].price)
                : (bestBid + bestAsk) / 2;

            return NextResponse.json({
                product,
                price: lastPrice,
                bid: bestBid,
                ask: bestAsk,
                spread: bestAsk - bestBid,
            });
        } catch (error) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Failed to fetch ticker' },
                { status: 500 }
            );
        }
    }

    // Use public Exchange API for USD pairs (no auth required)
    try {
        const response = await fetch(
            `${EXCHANGE_API}/products/${product}/ticker`,
            {
                headers: { 'Content-Type': 'application/json' },
                next: { revalidate: 5 },
            }
        );

        if (!response.ok) {
            throw new Error(`Exchange API error: ${response.status}`);
        }

        const data = await response.json() as {
            price: string;
            bid: string;
            ask: string;
            volume: string;
            time: string;
        };

        const price = parseFloat(data.price || '0');
        const bid = parseFloat(data.bid || '0');
        const ask = parseFloat(data.ask || '0');

        return NextResponse.json({
            product,
            price,
            bid,
            ask,
            spread: ask - bid,
            volume: parseFloat(data.volume || '0'),
            time: data.time,
        });
    } catch (error) {
        console.error('Ticker fetch error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch ticker' },
            { status: 500 }
        );
    }
}
