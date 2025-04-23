import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

/**
 * GET handler for admin announcements endpoint
 * Retrieves all announcements with pagination and filtering
 */
export async function GET(req) {
  // Authenticate the user before proceeding
  const auth = await authenticateUser(req);
  
  // Return 401 Unauthorized if authentication fails
  if (!auth.authenticated) {
    return unauthorized();
  }

  // Extract and parse URL parameters
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const search = url.searchParams.get('search');
  const type = url.searchParams.get('type');
  const priority = url.searchParams.get('priority');
  const date = url.searchParams.get('date');
  const isActive = url.searchParams.get('isActive');
  
  // Calculate pagination range values for Supabase query
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  
  try {
    // Build the count query first with filters
    let countQuery = supabase.from('announcements').select('*', { count: 'exact', head: true });
    
    // Apply filters to count query
    if (search) {
      // Simple title search for now
      countQuery = countQuery.ilike('title', `%${search}%`);
    }
    
    if (type) {
      countQuery = countQuery.eq('type', type.toLowerCase());
    }
    
    if (priority) {
      countQuery = countQuery.eq('priority', priority.toLowerCase());
    }
    
    if (date) {
      countQuery = countQuery.eq('date', date);
    }
    
    if (isActive !== null && isActive !== undefined) {
      countQuery = countQuery.eq('is_active', isActive === 'true');
    }
    
    // Execute count query
    const { count, error: countError } = await countQuery;
    
    if (countError) throw countError;
    
    // Build data query with the same filters
    let dataQuery = supabase
      .from('announcements')
      .select(`
        announcement_id,
        title,
        description,
        date,
        priority,
        is_active,
        type
      `);
    
    // Apply the same filters to data query
    if (search) {
      dataQuery = dataQuery.ilike('title', `%${search}%`);
    }
    
    if (type) {
      dataQuery = dataQuery.eq('type', type.toLowerCase());
    }
    
    if (priority) {
      dataQuery = dataQuery.eq('priority', priority.toLowerCase());
    }
    
    if (date) {
      dataQuery = dataQuery.eq('date', date);
    }
    
    if (isActive !== null && isActive !== undefined) {
      dataQuery = dataQuery.eq('is_active', isActive === 'true');
    }
    
    // Add ordering and pagination
    dataQuery = dataQuery
      .order('date', { ascending: false })
      .range(from, to);
    
    // Execute data query
    const { data: announcements, error } = await dataQuery;
    
    if (error) throw error;
    
    // Transform data to match the API documentation format
    const transformedAnnouncements = announcements.map(announcement => ({
      id: announcement.announcement_id.toString(),
      title: announcement.title,
      description: announcement.description,
      date: announcement.date,
      priority: announcement.priority,
      type: announcement.type === 'notice' ? 'Information' : announcement.type,
      isActive: announcement.is_active
    }));
    
    // Calculate total pages
    const totalPages = Math.ceil(count / limit);
    
    // Return success response with data and pagination
    return NextResponse.json({
      success: true,
      data: {
        announcements: transformedAnnouncements,
        pagination: {
          total: count,
          pages: totalPages,
          page,
          limit,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'An error occurred while fetching announcements',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler for admin announcements endpoint
 * Creates a new announcement
 */
export async function POST(req) {
  // Authenticate the user before proceeding
  const auth = await authenticateUser(req);
  
  // Return 401 Unauthorized if authentication fails
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    const body = await req.json();
    
    // Validate required fields
    const errors = [];
    
    if (!body.title) {
      errors.push({ field: 'title', message: 'Title is required' });
    } else if (body.title.length < 3 || body.title.length > 100) {
      errors.push({ field: 'title', message: 'Title must be between 3 and 100 characters' });
    }
    
    if (!body.description) {
      errors.push({ field: 'description', message: 'Description is required' });
    } else if (body.description.length < 10 || body.description.length > 1000) {
      errors.push({ field: 'description', message: 'Description must be between 10 and 1000 characters' });
    }
    
    if (!body.date) {
      errors.push({ field: 'date', message: 'Date is required' });
    } else {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(body.date)) {
        errors.push({ field: 'date', message: 'Date must be in YYYY-MM-DD format' });
      }
    }
    
    if (body.priority && !['High', 'Medium', 'Low'].includes(body.priority)) {
      errors.push({ field: 'priority', message: 'Priority must be one of: High, Medium, Low' });
    }
    
    if (body.type && !['event', 'notice', 'reminder', 'news','calendar'].includes(body.type)) {
      errors.push({ field: 'type', message: 'Type must be one of: event, notice, reminder, news, calendar' });
    }
    
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
      errors.push({ field: 'isActive', message: 'isActive must be a boolean value' });
    }
    
    // Return validation errors if any
    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Validation error',
          errors,
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // Convert priority and type to lowercase for database consistency
    const priority = body.priority ? body.priority.toLowerCase() : 'medium';
    // Map Information type to notice (which is in the DB schema)
    const type = body.type ? (body.type === 'Information' ? 'notice' : body.type.toLowerCase()) : 'notice';
    
    // Insert new announcement
    const { data, error } = await supabase
      .from('announcements')
      .insert([
        {
          title: body.title,
          description: body.description,
          date: body.date,
          priority: priority,
          is_active: body.isActive ?? true,
          type: type
        }
      ])
      .select();

    if (error) throw error;
    
    // Transform response to match API documentation format
    const createdAnnouncement = {
      id: data[0].announcement_id.toString(),
      title: data[0].title,
      description: data[0].description,
      date: data[0].date,
      priority: data[0].priority,
      type: data[0].type === 'notice' ? 'Information' : data[0].type,
      isActive: data[0].is_active
    };

    return NextResponse.json({
      success: true,
      data: createdAnnouncement,
      message: 'Announcement created successfully',
      timestamp: new Date().toISOString()
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating announcement:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'An error occurred while creating the announcement',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

