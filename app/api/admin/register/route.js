import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { signJWT } from '@/lib/jwt';
import bcrypt from 'bcryptjs';

export async function POST(req) {
  try {
    const { name, mobile, password } = await req.json();

    // Validate input
    if (!name || !mobile || !password) {
      return NextResponse.json(
        { error: 'Name, mobile number and password are required' },
        { status: 400 }
      );
    }

    // Check if mobile number already exists
    const { data: existingAdmin, error: checkError } = await supabase
      .from('admin_users')
      .select('id')
      .eq('mobile', mobile)
      .single();

    if (existingAdmin) {
      return NextResponse.json(
        { error: 'Mobile number already registered' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new admin user
    const { data: adminData, error: createError } = await supabase
      .from('admin_users')
      .insert([
        {
          name,
          mobile,
          password: hashedPassword,
          role: 'admin',
          is_active: true
        }
      ])
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    // Generate JWT token
    const token = signJWT({
      id: adminData.id,
      mobile: adminData.mobile,
      role: 'admin',
      name: adminData.name
    });

    return NextResponse.json(
      { 
        message: 'Admin registered successfully',
        token,
        user: {
          id: adminData.id,
          name: adminData.name,
          mobile: adminData.mobile,
          role: adminData.role
        }
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Admin registration error:', error);
    return NextResponse.json(
      { error: 'Failed to register admin' },
      { status: 500 }
    );
  }
} 