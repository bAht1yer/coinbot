import { NextResponse } from 'next/server';
import { coinbaseClient } from '@/lib/coinbase';

export async function GET() {
    const hasCredentials = coinbaseClient.hasCredentials();

    if (!hasCredentials) {
        return NextResponse.json({
            connected: false,
            message: 'No API credentials configured',
        });
    }

    try {
        const accounts = await coinbaseClient.getAccounts();
        return NextResponse.json({
            connected: true,
            accountCount: accounts.accounts.length,
        });
    } catch (error) {
        return NextResponse.json({
            connected: false,
            error: error instanceof Error ? error.message : 'Connection failed',
        });
    }
}
