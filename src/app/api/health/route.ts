import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/health
// Health check endpoint cho Docker + monitoring
// Returns: { status, uptime, db, timestamp }
export async function GET() {
  const start = Date.now()

  try {
    // Test DB connection
    await db.$queryRaw`SELECT 1`

    return NextResponse.json({
      status: 'healthy',
      uptime: process.uptime(),
      db: 'connected',
      responseTime: `${Date.now() - start}ms`,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    }, { status: 200 })
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      db: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 503 })
  }
}
