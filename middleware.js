import { NextResponse } from 'next/server'
import { verifyJWT } from './lib/jwt'

/**
 * @fileoverview Global middleware for API route authentication
 * @module middleware
 */

/**
 * List of routes that don't require authentication
 * @constant {string[]}
 */
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/verify-otp',
  '/api/auth/reset-password',
  '/api/auth/resend-otp',
  '/api/admin/attendance'
]

/**
 * Middleware function to handle API authentication
 * - Skips authentication for public routes
 * - Verifies JWT token for protected routes
 * - Injects user data into request headers upon successful authentication
 *
 * @param {Request} request - Incoming HTTP request
 * @returns {Response} Modified response or error response
 * 
 * @throws {Error} 401 - No authentication token provided
 * @throws {Error} 403 - Invalid or expired token
 */
export async function middleware(request) {
  const { pathname } = request.nextUrl

  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next()
  }

  const token = request.headers.get('authorization')?.split(' ')[1]
  
  if (!token) {
    return NextResponse.json(
      { status: 'error', message: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const decoded = await verifyJWT(token)
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('user', JSON.stringify(decoded))
    
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Invalid or expired token' },
      { status: 403 }
    )
  }
}

/**
 * Middleware configuration
 * @constant {Object}
 * @property {string} matcher - Path pattern for middleware execution
 */
export const config = {
  matcher: '/',
}
