import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
    try {
        // Test database connection by running a simple query
        await prisma.$queryRaw`SELECT 1`;

        return NextResponse.json({
            status: 'connected',
            message: 'PostgreSQL connected',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Database health check failed:', error);

        return NextResponse.json(
            {
                status: 'error',
                error: 'Database connection failed',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 503 }
        );
    } finally {
        await prisma.$disconnect();
    }
}
