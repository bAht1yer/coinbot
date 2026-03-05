import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { coinbaseClient } from '@/lib/coinbase';
import { encrypt, decrypt, maskKey } from '@/lib/encryption';

// In-memory cache (for current session, refreshed from DB on restart)
let cachedCredentials: { keyId: string; privateKey: string } | null = null;

/**
 * POST - Configure API credentials
 * Validates with Coinbase, encrypts, and stores in database
 */
export async function POST(request: NextRequest) {
    try {
        // Get authenticated user
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized - Please login first' },
                { status: 401 }
            );
        }

        const userId = session.user.id;
        const body = await request.json();
        const { keyId, privateKey, label } = body;

        if (!keyId || !privateKey) {
            return NextResponse.json(
                { error: 'Missing keyId or privateKey' },
                { status: 400 }
            );
        }

        // Validate Base64 format for private key
        try {
            const decoded = atob(privateKey);
            if (decoded.length < 32) {
                throw new Error('Key too short');
            }
        } catch {
            return NextResponse.json(
                { error: 'Invalid privateKey format (must be base64)' },
                { status: 400 }
            );
        }

        // Set credentials for testing
        coinbaseClient.setCredentials({ keyId, privateKey });

        // Test connection with Coinbase
        try {
            const accounts = await coinbaseClient.getAccounts();

            // Success! Encrypt and store in database
            const encryptedSecret = encrypt(privateKey);

            // Use upsert - update if userId exists, create if not
            const credentials = await prisma.apiCredentials.upsert({
                where: { userId },
                update: {
                    apiKeyId: keyId,
                    apiKeySecret: encryptedSecret,
                    label: label || `API Key ${maskKey(keyId)}`,
                    isActive: true,
                    lastUsed: new Date(),
                },
                create: {
                    userId,
                    apiKeyId: keyId,
                    apiKeySecret: encryptedSecret,
                    label: label || `API Key ${maskKey(keyId)}`,
                    isActive: true,
                    lastUsed: new Date(),
                },
            });

            // Cache for current session
            cachedCredentials = { keyId, privateKey };

            console.log(`[Auth] API credentials saved for user ${userId}: ${maskKey(keyId)}`);

            return NextResponse.json({
                success: true,
                message: 'API credentials encrypted and saved',
                accountCount: accounts.accounts.length,
                credentialId: credentials.id,
            });
        } catch (error) {
            // Clear on failure
            cachedCredentials = null;
            return NextResponse.json(
                {
                    error: 'Failed to connect to Coinbase API',
                    details: error instanceof Error ? error.message : 'Unknown error'
                },
                { status: 401 }
            );
        }
    } catch (error) {
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
        );
    }
}

/**
 * GET - Check if credentials exist and are valid
 */
export async function GET() {
    try {
        // Get authenticated user
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({
                configured: false,
                message: 'Please login first',
            });
        }

        const userId = session.user.id;

        // Check database for this user's credentials
        const credentials = await prisma.apiCredentials.findFirst({
            where: { userId, isActive: true },
            select: {
                id: true,
                apiKeyId: true,
                label: true,
                lastUsed: true,
                createdAt: true,
            },
        });

        if (!credentials) {
            return NextResponse.json({
                configured: false,
                message: 'No API credentials configured',
            });
        }

        return NextResponse.json({
            configured: true,
            keyId: maskKey(credentials.apiKeyId),
            label: credentials.label,
            lastUsed: credentials.lastUsed,
            createdAt: credentials.createdAt,
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to check credentials' },
            { status: 500 }
        );
    }
}

/**
 * DELETE - Remove active credentials
 */
export async function DELETE() {
    try {
        // Get authenticated user
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = session.user.id;

        await prisma.apiCredentials.updateMany({
            where: { userId, isActive: true },
            data: { isActive: false },
        });

        cachedCredentials = null;

        return NextResponse.json({
            success: true,
            message: 'Credentials deactivated'
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to delete credentials' },
            { status: 500 }
        );
    }
}

/**
 * Load credentials from database (for worker use)
 */
export async function loadCredentialsFromDB(): Promise<{ keyId: string; privateKey: string } | null> {
    if (cachedCredentials) {
        return cachedCredentials;
    }

    try {
        const credentials = await prisma.apiCredentials.findFirst({
            where: { isActive: true },
        });

        if (!credentials) {
            return null;
        }

        // Decrypt the private key
        const privateKey = decrypt(credentials.apiKeySecret);

        cachedCredentials = {
            keyId: credentials.apiKeyId,
            privateKey,
        };

        // Update last used
        await prisma.apiCredentials.update({
            where: { id: credentials.id },
            data: { lastUsed: new Date() },
        });

        return cachedCredentials;
    } catch (error) {
        console.error('[Auth] Failed to load credentials:', error);
        return null;
    }
}
