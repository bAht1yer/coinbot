import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { coinbaseClient } from '@/lib/coinbase';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

export async function GET() {
    // 1. Check if user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json(
            { error: 'Not authenticated' },
            { status: 401 }
        );
    }

    // 2. Load credentials from database for this user
    try {
        const credentials = await prisma.apiCredentials.findFirst({
            where: { userId: session.user.id, isActive: true },
        });

        if (!credentials) {
            return NextResponse.json(
                { error: 'No API credentials configured' },
                { status: 401 }
            );
        }

        // Decrypt and set credentials for this request
        const privateKey = decrypt(credentials.apiKeySecret);
        coinbaseClient.setCredentials({
            keyId: credentials.apiKeyId,
            privateKey,
        });

        // 3. Fetch accounts from Coinbase
        const response = await coinbaseClient.getAccounts();

        // Transform to simplified format
        const accounts = response.accounts.map((acc: any) => ({
            currency: acc.currency,
            available: parseFloat(acc.available_balance?.value || '0'),
            hold: parseFloat(acc.hold?.value || '0'),
            total: parseFloat(acc.available_balance?.value || '0') + parseFloat(acc.hold?.value || '0'),
        }));

        // Filter to relevant currencies
        const currencies = ['BTC', 'ETH', 'SOL', 'USD', 'USDC'];
        const filtered = accounts.filter((acc: any) =>
            currencies.includes(acc.currency) && acc.total > 0
        );

        return NextResponse.json({ accounts: filtered });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch accounts' },
            { status: 500 }
        );
    }
}
