import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // In production, this would check if the Docker worker container is responding
        // For now, we'll return a mock response
        // You can extend this to check actual worker status via health endpoint

        // TODO: Replace with actual worker health check
        // Example: await fetch('http://worker:3000/health')

        return NextResponse.json({
            status: 'connected',
            message: 'Worker service active',
            uptime: 'N/A - Health check not implemented',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        return NextResponse.json(
            {
                status: 'error',
                error: 'Worker service unreachable',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 503 }
        );
    }
}
