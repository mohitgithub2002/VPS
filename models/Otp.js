/**
 * @fileoverview Schema for OTP (One-Time Password) management
 * @module models/Otp
 */

/**
 * OTP schema for authentication and verification purposes
 * @typedef {Object} Otp
 * @property {string} studentId - The ID of the student the OTP is issued to
 * @property {string} rollNumber - Student's roll number for identification
 * @property {string} otp - Hashed OTP value
 * @property {string} purpose - Purpose of OTP (currently only 'password_reset')
 * @property {Date} expiresAt - Timestamp when the OTP expires
 * @property {boolean} isUsed - Flag indicating if the OTP has been used
 * @property {Date} createdAt - Timestamp of OTP creation
 * @property {Date} updatedAt - Timestamp of last OTP update
 */

import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    index: true
  },
  rollNumber: {
    type: String,
    required: true
  },
  otp: {
    type: String,
    required: true
  },
  purpose: {
    type: String,
    required: true,
    enum: ['password_reset']
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

export default mongoose.models.Otp || mongoose.model('Otp', otpSchema);
