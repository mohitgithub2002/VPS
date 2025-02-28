# Authentication Middleware

## Overview
Global middleware for protecting API routes and handling authentication.

## Features
- Route-based authentication bypass
- JWT token verification
- User data injection into request headers
- Error handling for authentication failures

## Public Routes
Routes that skip authentication:
```javascript
[
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/verify-otp',
  '/api/auth/reset-password',
  '/api/auth/resend-otp'
]
```

## Authentication Process
1. Checks if route is public
2. Extracts Bearer token from Authorization header
3. Verifies JWT token
4. Injects decoded user data into request headers

## Error Responses

### No Token (401 Unauthorized)
```json
{
  "status": "error",
  "message": "Authentication required"
}
```

### Invalid Token (403 Forbidden)
```json
{
  "status": "error",
  "message": "Invalid or expired token"
}
```

## Configuration
Applies to all routes matching: `/api/:path*`
