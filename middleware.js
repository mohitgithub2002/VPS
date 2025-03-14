import { NextResponse } from 'next/server'

/**
 * @fileoverview Global middleware for CORS configuration
 * @module middleware
 */

/**
 * Middleware function to handle CORS
 * - Sets appropriate CORS headers for cross-origin requests
 * - Handles preflight OPTIONS requests
 *
 * @param {Request} request - Incoming HTTP request
 * @returns {Response} Modified response with CORS headers
 */
export async function middleware(request) {
  // Handle preflight OPTIONS request
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // Forward the request with CORS headers
  const response = NextResponse.next()
  
  // Set CORS headers
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  return response
}

/**
 * Middleware configuration
 * @constant {Object}
 * @property {string} matcher - Path pattern for middleware execution
 */
export const config = {
  matcher: '/api/:path*',
}
