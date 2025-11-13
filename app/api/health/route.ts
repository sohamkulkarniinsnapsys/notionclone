// app/api/health/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/health
 * Health check endpoint for monitoring
 */
export async function GET() {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        api: 'running',
      },
    });
  } catch (err) {
    console.error('Health check failed:', err);
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'disconnected',
          api: 'running',
        },
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
