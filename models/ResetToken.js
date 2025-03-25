/**
 * @fileoverview Schema for password reset tokens
 * @module models/ResetToken
 */

/**
 * Reset token schema for password reset functionality
 * @typedef {Object} ResetToken
 * @property {string} authId - The ID from auth_data table
 * @property {string} token - Unique reset token for password reset verification
 * @property {Date} expiresAt - Timestamp when the token expires
 * @property {boolean} isUsed - Flag indicating if the token has been used
 * @property {Date} createdAt - Timestamp of token creation
 * @property {Date} updatedAt - Timestamp of last token update
 */

import mongoose from 'mongoose';

const resetTokenSchema = new mongoose.Schema({
  authId: {
    type: String,
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isUsed: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

export default mongoose.models.ResetToken || mongoose.model('ResetToken', resetTokenSchema);
