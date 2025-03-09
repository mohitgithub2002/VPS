import { NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/jwt';

export async function authenticateUser(req) {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Missing or invalid authentication token' };
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const userData = verifyJWT(token);
    return { authenticated: true, user: userData };
  } catch (error) {
    return { authenticated: false, error: 'Invalid token' };
  }
}

export async function authenticateAdmin(req) {
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Missing or invalid authentication token' };
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const userData = verifyJWT(token);
    if (userData.role !== 'admin') {
      return { authenticated: false, error: 'User is not an admin' };
    }
    return { authenticated: true, admin: userData };
  } catch (error) {
    return { authenticated: false, error: 'Invalid token' };
  }
}

export function unauthorized() {
  return NextResponse.json(
    { success: false, message: 'Unauthorized' },
    { status: 401 }
  );
}
