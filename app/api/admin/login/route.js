import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { signJWT } from '@/lib/jwt';
import bcrypt from 'bcryptjs';

export async function POST(req) {
  try {
    const { mobile, password } = await req.json();

    // Validate input
    if (!mobile || !password) {
      return NextResponse.json(
        { error: 'Mobile number and password are required' },
        { status: 400 }
      );
    }

    // Find admin by mobile number
    const { data: adminData, error: adminError } = await supabase
      .from('admin_users')
      .select('*')
      .eq('mobile', mobile)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Check if admin is active
    if (!adminData.is_active) {
      return NextResponse.json(
        { error: 'Account is deactivated' },
        { status: 403 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, adminData.password);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Update last login
    await supabase
      .from('admin_users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', adminData.id);

    // Generate JWT token
    const token = signJWT({
      id: adminData.id,
      mobile: adminData.mobile,
      role: 'admin',
      name: adminData.name
    });

    return NextResponse.json(
      { 
        message: 'Login successful',
        token,
        user: {
          id: adminData.id,
          name: adminData.name,
          mobile: adminData.mobile,
          role: adminData.role
        }
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 