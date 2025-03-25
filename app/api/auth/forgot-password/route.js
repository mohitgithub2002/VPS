/**
 * @fileoverview API endpoint for initiating password reset process
 * @module api/auth/forgot-password
 */

/**
 * POST /api/auth/forgot-password
 * Initiates password reset by sending OTP to user's registered mobile
 * 
 * @param {Object} req - Next.js API request
 * @param {Object} req.body - Request body
 * @param {string} req.body.mobile - User's mobile number
 * 
 * @returns {Object} Response object
 * @returns {string} response.status - 'success' or 'error'
 * @returns {string} response.message - Response message
 * @returns {Object} [response.data] - Response payload on success
 * @returns {string} response.data.maskedMobile - Partially masked mobile number
 * 
 * @throws {Error} 404 - Mobile number not found
 * @throws {Error} 500 - Internal server error or OTP sending failure
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import connectDB from '@/utils/dbconnect';
import Otp from '@/models/Otp';
import bcrypt from 'bcryptjs';
import { sendOTP } from '@/lib/send-otp';

export async function POST(req) {
  try {
    await connectDB();
    const { mobile } = await req.json();

    const { data: authData, error } = await supabase
      .from('auth_data')
      .select('auth_id, mobile')
      .eq('mobile', mobile)
      .single();

    if (error || !authData) {
      return NextResponse.json(
        { status: 'error', message: 'Mobile number not found' },
        { status: 404 }
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    await Otp.create({
      authId: authData.auth_id,
      mobile,
      otp: await bcrypt.hash(otp, 10),
      purpose: 'password_reset',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    });

    // Send OTP via WhatsApp
    const sendResult = await sendOTP(mobile, otp);
    if (!sendResult?.success) {
      return NextResponse.json(
        { status: 'error', message: 'Failed to send OTP' },
        { status: 500 }
      );
    }

    const maskedMobile = mobile.replace(/\d(?=\d{4})/g, "*");
    
    return NextResponse.json({
      status: 'success',
      message: 'OTP sent successfully',
      data: { maskedMobile }
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
