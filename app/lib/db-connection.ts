
import { prisma } from './db'

/**
 * Check if an error is a database connection/timeout error
 * Enhanced to detect PostgreSQL idle_session_timeout (SqlState 57P05)
 */
function isConnectionError(error: any): boolean {
  if (!error) return false
  
  const errorMessage = error.message?.toLowerCase() || ''
  const errorCode = error.code || ''
  const sqlState = error.meta?.sqlState || ''
  
  // PostgreSQL SQLSTATE codes for connection issues
  const postgresConnectionStates = [
    '57P05', // idle_session_timeout - PostgreSQL terminates idle sessions
    '57P03', // cannot_connect_now
    '57P04', // database_dropped
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure
    '08001', // sqlclient_unable_to_establish_sqlconnection
    '08004', // sqlserver_rejected_establishment_of_sqlconnection
    '08007', // transaction_resolution_unknown
    '08P01', // protocol_violation
  ]
  
  if (postgresConnectionStates.includes(sqlState)) {
    console.warn(`🔴 PostgreSQL connection error detected: SQLSTATE ${sqlState}`)
    return true
  }
  
  // Prisma error codes for connection issues
  const prismaConnectionCodes = [
    'P1001', // Can't reach database server
    'P1002', // Connection timeout
    'P1008', // Operations timed out
    'P1017', // Connection closed
    'P2024', // Timed out fetching connection from pool
  ]
  
  if (prismaConnectionCodes.includes(errorCode)) {
    console.warn(`🔴 Prisma connection error detected: ${errorCode}`)
    return true
  }
  
  // PostgreSQL error patterns in message text
  const connectionErrorPatterns = [
    'connection terminated',
    'idle-session timeout',
    'idle_session_timeout',
    'terminating connection',
    'connection to server',
    'connection pool timeout',
    'connection closed',
    'server closed the connection',
    'connection lost',
    'connection refused',
    'econnrefused',
    'econnreset',
    'epipe',
    'etimedout',
    'socket hang up',
    'network error',
    'connection failed',
    'database is not available',
    'cannot connect to',
    'lost connection',
    'server terminated',
    'backend closed',
  ]
  
  const hasConnectionError = connectionErrorPatterns.some(pattern => errorMessage.includes(pattern))
  if (hasConnectionError) {
    console.warn(`🔴 Connection error pattern detected in message: ${errorMessage.substring(0, 100)}...`)
  }
  
  return hasConnectionError
}

/**
 * Safely execute a database query with automatic reconnection on connection errors
 */
export async function withDatabaseConnection<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  operationName = 'database operation'
): Promise<T> {
  let lastError: any
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Check connection health before attempting operation
      if (attempt > 1) {
        try {
          await prisma.$queryRaw`SELECT 1`
        } catch (healthError) {
          console.warn(`⚠️ Health check failed before retry ${attempt}, reconnecting...`)
          await prisma.$disconnect()
          await new Promise(resolve => setTimeout(resolve, 500))
          await prisma.$connect()
        }
      }
      
      // Execute the operation
      return await operation()
    } catch (error: any) {
      lastError = error
      
      // Log the error details
      console.error(`❌ Database error in ${operationName} (attempt ${attempt}/${maxRetries}):`, {
        code: error.code,
        message: error.message,
        name: error.name,
      })
      
      // Check if it's a connection error that we should retry
      if (isConnectionError(error) && attempt < maxRetries) {
        console.warn(`⚠️ Connection error detected, retrying ${operationName}...`)
        
        // Try to reconnect with exponential backoff
        try {
          await prisma.$disconnect()
          
          // Exponential backoff: 1s, 2s, 4s, etc., max 10s
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
          console.log(`⏳ Waiting ${backoffMs}ms before reconnecting...`)
          await new Promise(resolve => setTimeout(resolve, backoffMs))
          
          await prisma.$connect()
          console.log(`✅ Reconnected successfully, retrying ${operationName}...`)
        } catch (reconnectError) {
          console.error('❌ Reconnection failed:', reconnectError)
          // Continue to retry anyway, the next attempt will try to reconnect again
        }
        
        continue // Retry the operation
      }
      
      // If it's not a connection error or we've exhausted retries, throw
      if (attempt >= maxRetries) {
        console.error(`❌ All ${maxRetries} retry attempts exhausted for ${operationName}`)
      }
      throw error
    }
  }
  
  // If we get here, all retries failed
  throw lastError
}

/**
 * Check database connection health
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    console.error('❌ Database health check failed:', error)
    return false
  }
}

/**
 * Initialize database connection with health check
 */
export async function initializeDatabaseConnection(): Promise<void> {
  try {
    await prisma.$connect()
    const isHealthy = await checkDatabaseConnection()
    if (isHealthy) {
      console.log('✅ Database connection established and healthy')
    } else {
      console.warn('⚠️ Database connected but health check failed')
      // Try one more time
      await prisma.$disconnect()
      await new Promise(resolve => setTimeout(resolve, 1000))
      await prisma.$connect()
      const retryHealth = await checkDatabaseConnection()
      if (retryHealth) {
        console.log('✅ Database connection healthy after retry')
      } else {
        throw new Error('Database connection unhealthy after retry')
      }
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error)
    throw error
  }
}

/**
 * Ensure database connection is alive, reconnect if needed
 */
export async function ensureDatabaseConnection(): Promise<void> {
  const isHealthy = await checkDatabaseConnection()
  if (!isHealthy) {
    console.warn('⚠️ Database connection not healthy, reconnecting...')
    try {
      await prisma.$disconnect()
      await new Promise(resolve => setTimeout(resolve, 1000))
      await prisma.$connect()
      
      // Verify reconnection
      const retryHealth = await checkDatabaseConnection()
      if (retryHealth) {
        console.log('✅ Database reconnected successfully')
      } else {
        throw new Error('Failed to restore database connection')
      }
    } catch (error) {
      console.error('❌ Failed to ensure database connection:', error)
      throw error
    }
  }
}

/**
 * Execute a query with timeout protection
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName = 'operation'
): Promise<T> {
  let timeoutId: NodeJS.Timeout
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })
  
  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timeoutId!)
    return result
  } catch (error) {
    clearTimeout(timeoutId!)
    throw error
  }
}
