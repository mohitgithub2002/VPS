/**
 * @fileoverview JWT utility functions for token generation and verification
 * @module lib/jwt
 */

import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET

/**
 * Generate a signed JWT token
 * @param {Object} payload - Data to be encoded in the token
 * @param {string} [expiresIn='7d'] - Token expiration time
 * @returns {string} Signed JWT token
 */
export function signJWT(payload, expiresIn = '90d') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn })
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {JsonWebTokenError} If token is invalid
 * @throws {TokenExpiredError} If token has expired
 */
export function verifyJWT(token) {
  return jwt.verify(token, JWT_SECRET)
}
