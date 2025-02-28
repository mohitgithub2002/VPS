/**
 * @fileoverview API endpoint for resetting password using reset token
 * @module api/auth/reset-password
 */

/**
 * POST /api/auth/reset-password
 * Resets student's password using valid reset token
 * 
 * @param {Object} req - Next.js API request
 * @param {Object} req.body - Request body
 * @param {string} req.body.rollNumber - Student's roll number
 * @param {string} req.body.resetToken - Valid reset token from verify-otp
 * @param {string} req.body.newPassword - New password to set
 * 
 * @returns {Object} Response object
 * @returns {string} response.status - 'success' or 'error'
 * @returns {string} response.message - Response message
 * 
 * @throws {Error} 400 - Invalid or expired reset token
 * @throws {Error} 500 - Internal server error
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import connectDB from '@/utils/dbconnect';
import ResetToken from '@/models/ResetToken';
import bcrypt from 'bcryptjs';

export async function POST(req) {
  try {
    await connectDB();
    const { rollNumber, resetToken, newPassword } = await req.json();

    const storedToken = await ResetToken.findOne({
      token: resetToken,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    if (!storedToken) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const { error } = await supabase
      .from('students')
      .update({ password: hashedPassword })
      .eq('id', storedToken.studentId);

    if (error) {
      throw error;
    }

    // Delete the reset token instead of marking it as used
    await ResetToken.deleteOne({ _id: storedToken._id });

    return NextResponse.json({
      status: 'success',
      message: 'Password reset successful'
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
