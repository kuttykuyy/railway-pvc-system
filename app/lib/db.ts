import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  keepAliveInterval: NodeJS.Timeout | undefined
  listenersRegistered: boolean
  lastHealthCheck: number
  reconnecting: boolean
}

// Build connection URL with optimal pooling and timeout parameters
// SERVER-SIDE ONLY: This function should never run in the browser
function buildDatabaseUrl(): string {
  // Critical check: Only run on server-side
  if (typeof window !== 'undefined') {
    console.error('❌ CRITICAL: buildDatabaseUrl() called in browser context - this should never happen!')
    return '' // Return empty string to prevent crashes
  }
  
  const baseUrl = process.env.DATABASE_URL || ''
  
  // Validation: Ensure we have a valid database URL
  if (!baseUrl) {
    console.error('❌ DATABASE_URL is not defined in environment variables')
    return ''
  }
  
  // Additional validation: Check if it's a valid PostgreSQL URL format
  if (!baseUrl.startsWith('postgres://') && !baseUrl.startsWith('postgresql://')) {
    console.error('❌ DATABASE_URL is not a valid PostgreSQL connection string')
    console.log('Raw DATABASE_URL value (first 20 chars):', baseUrl.substring(0, 20))
    return baseUrl // Return as-is if not a standard postgres URL
  }
  
  // Parse URL to add/update parameters
  try {
    const url = new URL(baseUrl)
    
    // OPTIMIZED connection pooling to prevent idle session timeouts
    // Smaller pool for better connection management
    url.searchParams.set('connection_limit', '5')           // Slightly increased for better concurrency
    url.searchParams.set('pool_timeout', '10')              // Reduced - fail fast, retry quick
    url.searchParams.set('connect_timeout', '5')            // Faster timeout for quicker retry
    
    // CRITICAL: Connection lifecycle management
    // Set connection lifetime MUCH shorter than server's idle_session_timeout (120s)
    // This forces Prisma to proactively recycle connections before PostgreSQL kills them
    url.searchParams.set('connection_lifetime', '30')       // Recycle every 30s (was 60s)
    
    // Disable statement cache to prevent stale prepared statements on recycled connections
    url.searchParams.set('statement_cache_size', '0')
    
    // TCP keepalive - CRITICAL for detecting dead connections quickly
    url.searchParams.set('keepalives', '1')                 // Enable TCP keepalives
    url.searchParams.set('keepalives_idle', '10')           // Start after 10s idle
    url.searchParams.set('keepalives_interval', '5')        // Every 5s
    url.searchParams.set('keepalives_count', '3')           // 3 retries before declaring dead
    
    // Application-level timeout (PostgreSQL session parameter)
    url.searchParams.set('options', '-c idle_in_transaction_session_timeout=30000') // 30s
    
    return url.toString()
  } catch (error: any) {
    console.error('⚠️ Failed to parse DATABASE_URL:', error?.message || error)
    console.log('Raw DATABASE_URL value (first 30 chars):', baseUrl.substring(0, 30))
    console.log('DATABASE_URL length:', baseUrl.length)
    
    // Return original URL if parsing fails
    return baseUrl
  }
}

// Create Prisma client with retry logic and optimal pooling
// CRITICAL: Only create Prisma client on server-side
export const prisma = (() => {
  // If we're in the browser, return a mock client to prevent errors
  if (typeof window !== 'undefined') {
    // Return a Proxy that throws helpful errors if someone tries to use it
    return new Proxy({} as PrismaClient, {
      get: (target, prop) => {
        throw new Error(
          `Cannot use Prisma client in browser context. ` +
          `Attempted to access property: ${String(prop)}. ` +
          `Database operations must only be performed in server-side code (API routes, Server Components, etc.)`
        );
      }
    });
  }
  
  // Server-side: create or reuse existing Prisma client
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', { emit: 'event', level: 'error' }, { emit: 'event', level: 'warn' }] 
      : [{ emit: 'event', level: 'error' }],
    datasources: {
      db: {
        url: buildDatabaseUrl()
      }
    },
    // Optimize Prisma to handle connection issues gracefully
    errorFormat: 'pretty',
  });

  // Filter out idle-session timeout errors from Prisma's internal logging
  // These are expected and auto-recovered by the keep-alive mechanism
  (client as any).$on('error', (e: any) => {
    const msg = (e?.message || e?.target || '').toLowerCase();
    if (msg.includes('idle-session timeout') || msg.includes('57p05') || msg.includes('idle_session_timeout') || msg.includes('terminating connection')) {
      // Silently ignore - handled by reconnection logic
      return;
    }
    console.error('prisma:error', e?.message || e);
  });

  if (process.env.NODE_ENV === 'development') {
    (client as any).$on('warn', (e: any) => {
      console.warn('prisma:warn', e?.message || e);
    });
  }

  return client;
})()

// Only store in global if we're on the server
if (process.env.NODE_ENV !== 'production' && typeof window === 'undefined') {
  globalForPrisma.prisma = prisma as PrismaClient
}

// Helper function to check if connection is healthy
async function ensureConnection(): Promise<void> {
  const now = Date.now()
  const timeSinceLastCheck = now - (globalForPrisma.lastHealthCheck || 0)
  
  // Only check if it's been more than 10 seconds since last check
  if (timeSinceLastCheck < 10000) {
    return
  }
  
  if (globalForPrisma.reconnecting) {
    // Wait for ongoing reconnection
    await new Promise(resolve => setTimeout(resolve, 1000))
    return
  }
  
  try {
    await prisma.$queryRaw`SELECT 1`
    globalForPrisma.lastHealthCheck = now
  } catch (error: any) {
    console.error('🔴 Connection health check failed:', error?.message)
    
    // Enhanced error detection for PostgreSQL idle session termination
    const errorMsg = error?.message?.toLowerCase() || ''
    const errorCode = error?.code || ''
    const sqlState = error?.meta?.sqlState || ''
    
    const isIdleSessionTimeout = 
      // PostgreSQL error codes (SQLSTATE)
      sqlState === '57P05' ||                                    // idle_session_timeout
      sqlState === '57P03' ||                                    // cannot_connect_now
      sqlState === '08003' ||                                    // connection_does_not_exist
      sqlState === '08006' ||                                    // connection_failure
      // Prisma error codes
      errorCode === 'P1001' ||                                   // Can't reach database
      errorCode === 'P1002' ||                                   // Connection timeout
      errorCode === 'P1017' ||                                   // Connection closed
      errorCode === 'P2024' ||                                   // Pool timeout
      // Error message patterns
      errorMsg.includes('idle') ||
      errorMsg.includes('idle-session') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('terminating') ||
      errorMsg.includes('connection terminated') ||
      errorMsg.includes('connection closed') ||
      errorMsg.includes('server closed')
    
    if (isIdleSessionTimeout) {
      console.warn('⚠️  Detected idle session timeout in health check, attempting reconnection...')
      await reconnectDatabase()
    }
  }
}

// Aggressive reconnection with exponential backoff and jitter
async function reconnectDatabase(retries = 5): Promise<void> {
  if (globalForPrisma.reconnecting) {
    return
  }
  
  globalForPrisma.reconnecting = true
  
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 [${new Date().toISOString()}] Reconnecting to database (attempt ${i + 1}/${retries})...`)
      
      // Force disconnect all connections
      await prisma.$disconnect().catch(() => {})
      
      // Exponential backoff with jitter to prevent thundering herd
      const delay = Math.min(500 * Math.pow(2, i) + Math.random() * 1000, 10000)
      await new Promise(resolve => setTimeout(resolve, delay))
      
      // Reconnect
      await prisma.$connect()
      
      // Verify with actual query
      await prisma.$queryRaw`SELECT 1`
      
      console.log('✅ Database reconnected successfully')
      globalForPrisma.lastHealthCheck = Date.now()
      globalForPrisma.reconnecting = false
      return
    } catch (error: any) {
      console.error(`❌ Reconnection attempt ${i + 1} failed:`, error?.message)
      
      if (i === retries - 1) {
        console.error('🚨 All reconnection attempts exhausted')
        globalForPrisma.reconnecting = false
        throw error
      }
    }
  }
}

// Connection keep-alive mechanism to prevent idle session timeouts
if (typeof window === 'undefined') {
  // Increase max listeners to prevent warnings in development with HMR
  process.setMaxListeners(20)
  
  // AGGRESSIVE keep-alive: ping every 30 seconds to prevent idle timeout
  // Reduced frequency to avoid log spam while still preventing 120s server timeout
  const startKeepAlive = () => {
    if (globalForPrisma.keepAliveInterval) {
      clearInterval(globalForPrisma.keepAliveInterval)
    }
    
    globalForPrisma.keepAliveInterval = setInterval(async () => {
      try {
        // Keep ALL pool connections alive by running a query
        // This ensures no connection sits idle long enough for PostgreSQL to terminate it
        await prisma.$queryRaw`SELECT 1 as keep_alive`
        globalForPrisma.lastHealthCheck = Date.now()
      } catch (error: any) {
        const errorMsg = error?.message?.toLowerCase() || ''
        const errorCode = error?.code || ''
        const sqlState = error?.meta?.sqlState || ''
        
        // Check if this is an idle timeout error (expected and handled automatically)
        const isIdleTimeout = 
          sqlState === '57P05' ||
          sqlState === '57P03' ||
          sqlState === '08003' ||
          sqlState === '08006' ||
          errorCode === 'P1001' ||
          errorCode === 'P1002' ||
          errorCode === 'P1017' ||
          errorCode === 'P2024' ||
          errorMsg.includes('idle') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('terminating') ||
          errorMsg.includes('connection terminated') ||
          errorMsg.includes('connection closed') ||
          errorMsg.includes('server closed')
        
        if (isIdleTimeout) {
          // Silently reconnect - these are expected and handled
          try {
            await reconnectDatabase()
          } catch (reconnectError: any) {
            console.error('❌ Failed to recover from idle timeout:', reconnectError?.message)
          }
        } else {
          console.error(`❌ [${new Date().toISOString()}] Keep-alive ping failed:`, error?.message || error)
        }
      }
    }, 15000) // 15 seconds - more aggressive to prevent ANY idle timeout
  }
  
  // Start keep-alive when module loads
  startKeepAlive()
  
  // Graceful shutdown handling - only register once
  if (!globalForPrisma.listenersRegistered) {
    const cleanup = async () => {
      if (globalForPrisma.keepAliveInterval) {
        clearInterval(globalForPrisma.keepAliveInterval)
        globalForPrisma.keepAliveInterval = undefined
      }
      try {
        await prisma.$disconnect()
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    
    process.on('beforeExit', cleanup)
    
    process.on('SIGINT', async () => {
      await cleanup()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      await cleanup()
      process.exit(0)
    })
    
    process.on('SIGHUP', async () => {
      await cleanup()
      process.exit(0)
    })
    
    // Mark listeners as registered
    globalForPrisma.listenersRegistered = true
  }
  
  // Initial connection with retry
  (async () => {
    try {
      await prisma.$connect()
      globalForPrisma.lastHealthCheck = Date.now()
      console.log('✅ Database connected successfully')
    } catch (error: any) {
      console.error('❌ Initial database connection failed:', error?.message)
      // Try to reconnect
      await reconnectDatabase().catch(e => {
        console.error('🚨 Failed to establish initial database connection:', e?.message)
      })
    }
  })()
}

// Export helper for API routes to ensure connection before operations
export { ensureConnection }

/**
 * Pre-flight connection validation for API routes.
 * Call this at the start of any API route that uses the database.
 * It validates the connection is healthy before proceeding.
 */
export async function validateConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error: any) {
    const errorMsg = error?.message?.toLowerCase() || ''
    const sqlState = error?.meta?.sqlState || ''
    
    const isConnectionError = 
      sqlState === '57P05' ||
      sqlState === '08003' ||
      sqlState === '08006' ||
      errorMsg.includes('idle') ||
      errorMsg.includes('terminating') ||
      errorMsg.includes('connection')
    
    if (isConnectionError) {
      // Attempt silent recovery
      try {
        await reconnectDatabase()
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

/**
 * Wrapper for database operations with automatic retry on connection errors.
 * Use this for all database operations in API routes.
 * 
 * @example
 * const users = await withPrismaErrorHandling(() => 
 *   prisma.user.findMany()
 * )
 */
export async function withPrismaErrorHandling<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: any
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Pre-flight check on first attempt
      if (attempt === 1) {
        const timeSinceLastCheck = Date.now() - (globalForPrisma.lastHealthCheck || 0)
        if (timeSinceLastCheck > 10000) { // More than 10s since last health check
          await validateConnection()
        }
      }
      
      return await operation()
    } catch (error: any) {
      lastError = error
      const sqlState = error?.meta?.sqlState || ''
      const errorCode = error?.code || ''
      const errorMsg = error?.message?.toLowerCase() || ''
      
      // Comprehensive check for recoverable connection errors
      const isRecoverableError = 
        // PostgreSQL SQLSTATE codes
        sqlState === '57P05' ||   // idle_session_timeout
        sqlState === '57P03' ||   // cannot_connect_now
        sqlState === '08003' ||   // connection_does_not_exist
        sqlState === '08006' ||   // connection_failure
        sqlState === '08001' ||   // sqlclient_unable_to_establish_sqlconnection
        // Prisma error codes
        errorCode === 'P1001' ||  // Can't reach database server
        errorCode === 'P1002' ||  // Database server timeout
        errorCode === 'P1008' ||  // Operations timed out
        errorCode === 'P1017' ||  // Server has closed the connection
        errorCode === 'P2024' ||  // Timed out fetching a new connection from the pool
        // Error message patterns
        errorMsg.includes('idle-session timeout') ||
        errorMsg.includes('terminating connection') ||
        errorMsg.includes('connection terminated') ||
        errorMsg.includes('connection closed') ||
        errorMsg.includes('server closed') ||
        errorMsg.includes('connection reset') ||
        errorMsg.includes('econnreset') ||
        errorMsg.includes('socket hang up')
      
      if (isRecoverableError && attempt < maxRetries) {
        // Silent reconnection for expected errors
        try {
          await reconnectDatabase()
          // Exponential backoff: 200ms, 400ms, 800ms...
          await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, attempt - 1)))
          continue
        } catch {
          // If reconnection fails, throw original error
        }
      }
      
      throw error
    }
  }
  
  throw lastError
}

// Suppress Prisma's internal idle-timeout logs (they're handled automatically)
if (typeof window === 'undefined') {
  const originalConsoleError = console.error
  console.error = (...args: any[]) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').toLowerCase()
    // Skip logging for expected idle session timeouts that are auto-recovered
    if ((msg.includes('prisma') || msg.includes('postgresql connection')) && 
        (msg.includes('idle-session timeout') || msg.includes('idle_session_timeout') || 
         msg.includes('57p05') || msg.includes('terminating connection'))) {
      return // Silently ignore - these are handled by reconnection logic
    }
    originalConsoleError.apply(console, args)
  }

  // Also intercept process.stderr.write for Prisma engine-level logs
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  (process.stderr as any).write = (chunk: any, ...rest: any[]) => {
    const str = typeof chunk === 'string' ? chunk : chunk?.toString?.() || ''
    const lower = str.toLowerCase()
    if ((lower.includes('prisma') || lower.includes('postgresql')) &&
        (lower.includes('idle-session timeout') || lower.includes('idle_session_timeout') ||
         lower.includes('57p05') || lower.includes('terminating connection'))) {
      return true
    }
    return originalStderrWrite(chunk, ...rest)
  }
}
