
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const startTime = Date.now()
  
  try {
    // Test connection with simple query
    await prisma.$queryRaw`SELECT 1 as health_check`
    
    // Get current PostgreSQL settings
    const settings = await prisma.$queryRaw<Array<{
      idle_session_timeout: string
      idle_in_transaction: string
      statement_timeout: string
    }>>`
      SELECT 
        current_setting('idle_session_timeout') as idle_session_timeout,
        current_setting('idle_in_transaction_session_timeout') as idle_in_transaction,
        current_setting('statement_timeout') as statement_timeout
    `
    
    // Get connection pool info (Prisma doesn't expose this directly, so we'll show basic info)
    const databaseInfo = await prisma.$queryRaw<Array<{
      version: string
    }>>`SELECT version() as version`
    
    const latency = Date.now() - startTime
    
    return NextResponse.json({
      status: 'healthy',
      latency_ms: latency,
      timestamp: new Date().toISOString(),
      database_settings: settings[0],
      database_info: databaseInfo[0],
      connection_pool: {
        note: 'Connection pool managed by Prisma',
        configured_limit: 5,
        keepalive_interval: '5 seconds'
      }
    })
  } catch (error: any) {
    const latency = Date.now() - startTime
    
    return NextResponse.json({
      status: 'unhealthy',
      error: error?.message || 'Unknown error',
      error_code: error?.code,
      sql_state: error?.meta?.sqlState,
      latency_ms: latency,
      timestamp: new Date().toISOString()
    }, { status: 503 })
  }
}
