/**
 * @fileoverview API endpoint for OTP verification in password reset flow
 * @module api/auth/verify-otp
 */

/**
 * POST /api/auth/verify-otp
 * Verifies OTP and generates reset token for password reset
 * 
 * @param {Object} req - Next.js API request
 * @param {Object} req.body - Request body
 * @param {string} req.body.mobile - User's mobile number
 * @param {string} req.body.otp - OTP received by user
 * 
 * @returns {Object} Response object
 * @returns {string} response.status - 'success' or 'error'
 * @returns {string} response.message - Response message
 * @returns {Object} [response.data] - Response payload on success
 * @returns {string} response.data.resetToken - Token for password reset
 * 
 * @throws {Error} 400 - Invalid or expired OTP
 * @throws {Error} 500 - Internal server error
 */

import { NextResponse } from 'next/server';
import connectDB from '@/utils/dbconnect';
import Otp from '@/models/Otp';
import ResetToken from '@/models/ResetToken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function POST(req) {
  try {
    await connectDB();
    const { mobile, otp } = await req.json();

    const storedOTP = await Otp.findOne({
      mobile,
      purpose: 'password_reset',
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    if (!storedOTP || !await bcrypt.compare(otp, storedOTP.otp)) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid or expired OTP' },
        { status: 400 }
      );
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    await ResetToken.create({
      authId: storedOTP.authId,
      token: resetToken,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    });

    // Delete the OTP instead of marking it as used
    await Otp.deleteOne({ _id: storedOTP._id });

    return NextResponse.json({
      status: 'success',
      message: 'OTP verified successfully',
      data: { resetToken }
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
