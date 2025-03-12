/**
 * User Settings API
 * Handles user preferences and settings management
 */

import { NextResponse } from 'next/server';
import { authenticateUser, unauthorized } from '@/lib/auth';
import connectDB from '@/utils/dbconnect';
import UserPreference from '@/models/UserPreference';

/**
 * @route GET /api/users/settings
 * @desc Retrieves user preferences and settings
 * 
 * @security
 * - Requires authentication via JWT token
 * - User-specific data isolation
 * 
 * @response
 * Success (200):
 * {
 *   success: true,
 *   settings: {
 *     notifications: boolean,
 *     darkMode: boolean
 *   }
 * }
 * 
 * Error (401/500):
 * {
 *   success: false,
 *   message: string - Error description
 * }
 */
export async function GET(req) {
  // Authenticate user and verify JWT token
  const auth = await authenticateUser(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  // Extract student ID from authenticated user
  const userId = auth.user.studentId;
  
  try {
    // Establish database connection
    await connectDB();
    
    // Find or create user preferences with default values
    let preferences = await UserPreference.findOne({ userId });
    
    if (!preferences) {
      // Initialize default preferences for new users
      preferences = await UserPreference.create({
        userId,
        settings: {
          notifications: true, // Default to enabled notifications
          darkMode: false     // Default to light mode
        },
        lastActive: new Date()
      });
    }

    return NextResponse.json({
      success: true,
      settings: preferences.settings
    });

  } catch (error) {
    // Log any unexpected errors and return a generic error message
    console.error('Settings API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch user settings' },
      { status: 500 }
    );
  }
}

/**
 * @route PUT /api/users/settings
 * @desc Updates user preferences and settings
 * 
 * @security
 * - Requires authentication via JWT token
 * - User-specific data isolation
 * 
 * @request
 * {
 *   notifications?: boolean - Toggle notification preferences
 *   darkMode?: boolean - Toggle dark mode preference
 * }
 * 
 * @response
 * Success (200):
 * {
 *   success: true,
 *   settings: {
 *     notifications: boolean,
 *     darkMode: boolean
 *   }
 * }
 * 
 * Error (401/500):
 * {
 *   success: false,
 *   message: string - Error description
 * }
 */
export async function PUT(req) {
  // Authenticate user and verify JWT token
  const auth = await authenticateUser(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  // Extract student ID from authenticated user
  const userId = auth.user.studentId;
  
  try {
    // Parse request body for settings updates
    const body = await req.json();
    
    // Establish database connection
    await connectDB();
    
    // Prepare update object with only provided settings
    const updateData = {};
    if (body.notifications !== undefined) {
      updateData['settings.notifications'] = body.notifications;
    }
    if (body.darkMode !== undefined) {
      updateData['settings.darkMode'] = body.darkMode;
    }
    
    // Update user's last activity timestamp
    updateData.lastActive = new Date();
    
    // Update preferences using findOneAndUpdate with upsert
    // This creates a new document if none exists, or updates existing one
    const preferences = await UserPreference.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    return NextResponse.json({
      success: true,
      settings: preferences.settings
    });

  } catch (error) {
    // Log any unexpected errors and return a generic error message
    console.error('Settings update API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update user settings' },
      { status: 500 }
    );
  }
}
