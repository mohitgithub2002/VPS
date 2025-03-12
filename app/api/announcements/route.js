/**
 * @file Announcements API Route
 * @description Handles API requests for the announcements resource
 * This file implements the REST API endpoints for retrieving announcement data
 * with pagination support, authentication, and error handling.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

/**
 * GET handler for announcements endpoint
 * 
 * @param {Request} req - The incoming HTTP request object
 * @returns {Promise<NextResponse>} JSON response with announcements data or error
 * 
 * @description
 * Retrieves a paginated list of announcements from the database.
 * Supports query parameters:
 *   - page: Current page number (default: 1)
 *   - pageSize: Number of items per page (default: 20)
 * 
 * Authentication is required to access this endpoint.
 */
export async function GET(req) {
  // Authenticate the user before proceeding
  const auth = await authenticateUser(req);
  
  // Return 401 Unauthorized if authentication fails
  if (!auth.authenticated) {
    return unauthorized();
  }

  // Extract and parse pagination parameters from URL query string
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
  
  // Calculate pagination range values for Supabase query
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  
  try {
    // First query: Get total count of announcements for pagination metadata
    const { count, error: countError } = await supabase
      .from('announcements')
      .select('*', { count: 'exact', head: true });
      
    if (countError) throw countError;
    
    // Second query: Fetch the actual announcements data with pagination
    const { data: announcements, error } = await supabase
      .from('announcements')
      .select(`
        announcement_id,
        title,
        description,
        date,
        priority,
        is_active,
        type
      `)
      .order('date', { ascending: false }) // Sort by date, newest first
      .range(from, to);
    
    if (error) throw error;
    
    // Calculate total pages based on count and page size
    const totalPages = Math.ceil(count / pageSize);
    
    // Return successful response with announcements and pagination metadata
    return NextResponse.json({
      success: true,
      data: announcements,
      pagination: {
        totalItems: count,
        itemsPerPage: pageSize,
        currentPage: page,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (error) {
    // Log the error for server-side debugging
    console.error('Error fetching announcements:', error);
    
    // Return error response with appropriate status code
    return NextResponse.json(
      { success: false, message: 'Failed to fetch announcements', error: error.message },
      { status: 500 }
    );
  }
}
