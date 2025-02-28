/**
 * @fileoverview API endpoint for initiating password reset process
 * @module api/auth/forgot-password
 */

/**
 * POST /api/auth/forgot-password
 * Initiates password reset by sending OTP to student's registered mobile
 * 
 * @param {Object} req - Next.js API request
 * @param {Object} req.body - Request body
 * @param {string} req.body.rollNumber - Student's roll number
 * 
 * @returns {Object} Response object
 * @returns {string} response.status - 'success' or 'error'
 * @returns {string} response.message - Response message
 * @returns {Object} [response.data] - Response payload on success
 * @returns {string} response.data.maskedMobile - Partially masked mobile number
 * 
 * @throws {Error} 404 - Roll number not found
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
    const { rollNumber } = await req.json();

    const { data: student, error } = await supabase
      .from('students')
      .select('id, mobile')
      .eq('roll_no', rollNumber)
      .single();

    if (error || !student) {
      return NextResponse.json(
        { status: 'error', message: 'Roll number not found' },
        { status: 404 }
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    await Otp.create({
      studentId: student.id,
      rollNumber,
      otp: await bcrypt.hash(otp, 10),
      purpose: 'password_reset',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    });

    // Send OTP via WhatsApp
    const sendResult = await sendOTP(student.mobile, otp);
    if (!sendResult?.success) {
      return NextResponse.json(
        { status: 'error', message: 'Failed to send OTP' },
        { status: 500 }
      );
    }

    const maskedMobile = student.mobile.replace(/\d(?=\d{4})/g, "*");
    
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
