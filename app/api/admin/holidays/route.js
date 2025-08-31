/**
 * @path /api/admin/holidays
 * @fileoverview API routes for managing holidays in the school management system
 * Handles CRUD operations for holiday records using Supabase as the database
 */

import { supabase } from "@/utils/supabaseClient";
import { NextResponse } from "next/server";
import { authenticateAdmin, unauthorized } from '@/lib/auth';

/**
 * Helper function to get the latest session from the sessions table
 * @returns {Promise<Object|null>} Latest session data or null if no sessions exist
 */
async function getLatestSession() {
    try {
        const { data: latestSession, error } = await supabase
            .from('sessions')
            .select('session_id, session_name, start_date, end_date')
            .order('start_date', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching latest session:', error);
            return null;
        }

        return latestSession;
    } catch (error) {
        console.error('Error in getLatestSession:', error);
        return null;
    }
}

/**
 * GET endpoint to retrieve all holidays with optional filtering
 * @param {Request} req - The HTTP request object
 * @returns {Promise<NextResponse>} JSON response with holidays data or error
 */
export async function GET(req) {
    // Authenticate the incoming request
    const auth = await authenticateAdmin(req);
    
    if (!auth.authenticated) {
        return unauthorized();
    }

    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get('session_id');
        const type = searchParams.get('type');
        const startDate = searchParams.get('start_date');
        const endDate = searchParams.get('end_date');
        const searchName = searchParams.get('search');
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 10;

        const offset = (page - 1) * limit;

        let query = supabase
            .from('holiday')
            .select(`
                holiday_id,
                session_id,
                name,
                description,
                type,
                start_date,
                end_date,
                sessions:session_id(session_name)
            `)
            .order('start_date', { ascending: false });

        // Apply filters if provided
        if (sessionId) {
            query = query.eq('session_id', sessionId);
        }

        if (type) {
            query = query.eq('type', type);
        }

        if (startDate) {
            query = query.gte('start_date', startDate);
        }

        if (endDate) {
            query = query.lte('end_date', endDate);
        }

        if (searchName) {
            query = query.ilike('name', `%${searchName}%`);
        }

        // Get total count for pagination with same filters
        let countQuery = supabase
            .from('holiday')
            .select('*', { count: 'exact', head: true });

        // Apply same filters to count query
        if (sessionId) {
            countQuery = countQuery.eq('session_id', sessionId);
        }

        if (type) {
            countQuery = countQuery.eq('type', type);
        }

        if (startDate) {
            countQuery = countQuery.gte('start_date', startDate);
        }

        if (endDate) {
            countQuery = countQuery.lte('end_date', endDate);
        }

        if (searchName) {
            countQuery = countQuery.ilike('name', `%${searchName}%`);
        }

        const { count } = await countQuery;

        // Apply pagination
        query = query.range(offset, offset + limit - 1);

        const { data: holidays, error } = await query;

        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            holidays,
            pagination: {
                page,
                limit,
                total: count,
                totalPages: Math.ceil((count || 0) / limit)
            }
        });

    } catch (error) {
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

/**
 * POST endpoint to create a new holiday
 * @param {Request} req - The HTTP request object containing holiday data
 * @returns {Promise<NextResponse>} JSON response with created holiday data or error
 */
export async function POST(req) {
    // Authenticate the incoming request
    const auth = await authenticateAdmin(req);
    
    if (!auth.authenticated) {
        return unauthorized();
    }

    try {
        const data = await req.json();

        // Validate required fields
        if (!data.name || !data.start_date || !data.end_date || !data.type) {
            return NextResponse.json(
                { error: 'Missing required fields: name, start_date, end_date, and type are required' },
                { status: 400 }
            );
        }

        // Validate date format and logic
        const startDate = new Date(data.start_date);
        const endDate = new Date(data.end_date);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return NextResponse.json(
                { error: 'Invalid date format. Use YYYY-MM-DD format' },
                { status: 400 }
            );
        }

        if (endDate < startDate) {
            return NextResponse.json(
                { error: 'End date cannot be before start date' },
                { status: 400 }
            );
        }

        // Get the latest session automatically
        const latestSession = await getLatestSession();
        if (!latestSession) {
            return NextResponse.json(
                { error: 'No active session found. Please create a session first.' },
                { status: 400 }
            );
        }

        // Check for overlapping holidays globally (regardless of session)
        // Two date ranges overlap if: start_date <= new_end_date AND end_date >= new_start_date
        const { data: overlappingHolidays, error: overlapError } = await supabase
            .from('holiday')
            .select('holiday_id, name, start_date, end_date')
            .or(`and(start_date.lte.${data.end_date},end_date.gte.${data.start_date})`);

        if (overlapError) {
            console.error('Overlap check error:', overlapError);
            return NextResponse.json(
                { error: 'Error checking for overlapping holidays' },
                { status: 500 }
            );
        }

        if (overlappingHolidays && overlappingHolidays.length > 0) {
            return NextResponse.json(
                { 
                    error: 'Holiday dates overlap with existing holidays',
                    overlappingHolidays 
                },
                { status: 400 }
            );
        }

        // Create the holiday with the latest session_id
        const { data: holiday, error } = await supabase
            .from('holiday')
            .insert({
                session_id: latestSession.session_id,
                name: data.name,
                description: data.description || null,
                type: data.type,
                start_date: data.start_date,
                end_date: data.end_date
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { 
                success: true,
                message: 'Holiday created successfully', 
                holiday 
            },
            { status: 201 }
        );

    } catch (error) {
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

/**
 * PUT endpoint to update an existing holiday
 * @param {Request} req - The HTTP request object containing holiday update data
 * @returns {Promise<NextResponse>} JSON response with updated holiday data or error
 */
export async function PUT(req) {
    // Authenticate the incoming request
    const auth = await authenticateAdmin(req);
    
    if (!auth.authenticated) {
        return unauthorized();
    }

    try {
        const data = await req.json();

        // Validate required fields
        if (!data.holiday_id) {
            return NextResponse.json(
                { error: 'holiday_id is required for updates' },
                { status: 400 }
            );
        }

        // Check if holiday exists
        const { data: existingHoliday, error: fetchError } = await supabase
            .from('holiday')
            .select('*')
            .eq('holiday_id', data.holiday_id)
            .single();

        if (fetchError || !existingHoliday) {
            return NextResponse.json(
                { error: 'Holiday not found' },
                { status: 404 }
            );
        }

        // Validate date logic if dates are being updated
        if (data.start_date || data.end_date) {
            const startDate = new Date(data.start_date || existingHoliday.start_date);
            const endDate = new Date(data.end_date || existingHoliday.end_date);
            
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return NextResponse.json(
                    { error: 'Invalid date format. Use YYYY-MM-DD format' },
                    { status: 400 }
                );
            }

            if (endDate < startDate) {
                return NextResponse.json(
                    { error: 'End date cannot be before start date' },
                    { status: 400 }
                );
            }
        }

        // Check for overlapping holidays globally (excluding current holiday)
        if (data.start_date || data.end_date) {
            const startDate = data.start_date || existingHoliday.start_date;
            const endDate = data.end_date || existingHoliday.end_date;

            // Two date ranges overlap if: start_date <= new_end_date AND end_date >= new_start_date
            const { data: overlappingHolidays, error: overlapError } = await supabase
                .from('holiday')
                .select('holiday_id, name, start_date, end_date')
                .neq('holiday_id', data.holiday_id)
                .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

            if (overlapError) {
                console.error('Overlap check error:', overlapError);
                return NextResponse.json(
                    { error: 'Error checking for overlapping holidays' },
                    { status: 500 }
                );
            }

            if (overlappingHolidays && overlappingHolidays.length > 0) {
                return NextResponse.json(
                    { 
                        error: 'Updated holiday dates overlap with existing holidays',
                        overlappingHolidays 
                    },
                    { status: 400 }
                );
            }
        }

        // Prepare update data
        const updateData = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.type !== undefined) updateData.type = data.type;
        if (data.start_date !== undefined) updateData.start_date = data.start_date;
        if (data.end_date !== undefined) updateData.end_date = data.end_date;
        if (data.session_id !== undefined) updateData.session_id = data.session_id;

        // Update the holiday
        const { data: updatedHoliday, error } = await supabase
            .from('holiday')
            .update({
                ...updateData,
                updated_at: new Date().toISOString()
            })
            .eq('holiday_id', data.holiday_id)
            .select()
            .single();

        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Holiday updated successfully',
            holiday: updatedHoliday
        });

    } catch (error) {
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

/**
 * DELETE endpoint to delete a holiday
 * @param {Request} req - The HTTP request object containing holiday_id
 * @returns {Promise<NextResponse>} JSON response with success message or error
 */
export async function DELETE(req) {
    // Authenticate the incoming request
    const auth = await authenticateAdmin(req);
    
    if (!auth.authenticated) {
        return unauthorized();
    }

    try {
        const { searchParams } = new URL(req.url);
        const holidayId = searchParams.get('holiday_id');

        if (!holidayId) {
            return NextResponse.json(
                { error: 'holiday_id is required for deletion' },
                { status: 400 }
            );
        }

        // Check if holiday exists
        const { data: existingHoliday, error: fetchError } = await supabase
            .from('holiday')
            .select('holiday_id, name')
            .eq('holiday_id', holidayId)
            .single();

        if (fetchError || !existingHoliday) {
            return NextResponse.json(
                { error: 'Holiday not found' },
                { status: 404 }
            );
        }

        // Delete the holiday
        const { error } = await supabase
            .from('holiday')
            .delete()
            .eq('holiday_id', holidayId);

        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Holiday "${existingHoliday.name}" deleted successfully`
        });

    } catch (error) {
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
