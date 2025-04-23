import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

/**
 * GET handler for retrieving a specific announcement by ID
 */
export async function GET(req, { params }) {
  // Authenticate the user before proceeding
  const auth = await authenticateUser(req);
  
  // Return 401 Unauthorized if authentication fails
  if (!auth.authenticated) {
    return unauthorized();
  }

  const { id } = params;
  
  try {
    // Get announcement by ID
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('announcement_id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          {
            success: false,
            message: 'Announcement not found',
            timestamp: new Date().toISOString()
          },
          { status: 404 }
        );
      }
      throw error;
    }
    
    // Transform data to match API documentation format
    const announcement = {
      id: data.announcement_id.toString(),
      title: data.title,
      description: data.description,
      date: data.date,
      priority: data.priority,
      type: data.type === 'notice' ? 'Information' : data.type,
      isActive: data.is_active
    };
    
    return NextResponse.json({
      success: true,
      data: announcement,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching announcement:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'An error occurred while fetching the announcement',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * PUT handler for updating an announcement
 */
export async function PUT(req, { params }) {
  // Authenticate the user before proceeding
  const auth = await authenticateUser(req);
  
  // Return 401 Unauthorized if authentication fails
  if (!auth.authenticated) {
    return unauthorized();
  }
  
  const { id } = params;
  
  try {
    const body = await req.json();
    
    // Validate fields if provided
    const errors = [];
    
    if (body.title !== undefined) {
      if (body.title.length < 3 || body.title.length > 100) {
        errors.push({ field: 'title', message: 'Title must be between 3 and 100 characters' });
      }
    }
    
    if (body.description !== undefined) {
      if (body.description.length < 10 || body.description.length > 1000) {
        errors.push({ field: 'description', message: 'Description must be between 10 and 1000 characters' });
      }
    }
    
    if (body.date !== undefined) {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(body.date)) {
        errors.push({ field: 'date', message: 'Date must be in YYYY-MM-DD format' });
      }
    }
    
    if (body.priority !== undefined && !['High', 'Medium', 'Low'].includes(body.priority)) {
      errors.push({ field: 'priority', message: 'Priority must be one of: High, Medium, Low' });
    }
    
    if (body.type !== undefined && !['Event', 'Meeting', 'Update', 'Information'].includes(body.type)) {
      errors.push({ field: 'type', message: 'Type must be one of: Event, Meeting, Update, Information' });
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
    
    // Check if announcement exists
    const { data: existingAnnouncement, error: checkError } = await supabase
      .from('announcements')
      .select('*')
      .eq('announcement_id', id)
      .single();
    
    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return NextResponse.json(
          {
            success: false,
            message: 'Announcement not found',
            timestamp: new Date().toISOString()
          },
          { status: 404 }
        );
      }
      throw checkError;
    }
    
    // Prepare update data
    const updateData = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.date !== undefined) updateData.date = body.date;
    if (body.priority !== undefined) updateData.priority = body.priority.toLowerCase();
    if (body.type !== undefined) {
      updateData.type = body.type === 'Information' ? 'notice' : body.type.toLowerCase();
    }
    if (body.isActive !== undefined) updateData.is_active = body.isActive;
    
    // Update announcement
    const { data, error } = await supabase
      .from('announcements')
      .update(updateData)
      .eq('announcement_id', id)
      .select();
    
    if (error) throw error;
    
    // Transform response to match API documentation format
    const updatedAnnouncement = {
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
      data: updatedAnnouncement,
      message: 'Announcement updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating announcement:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'An error occurred while updating the announcement',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE handler for deleting an announcement
 */
export async function DELETE(req, { params }) {
  // Authenticate the user before proceeding
  const auth = await authenticateUser(req);
  
  // Return 401 Unauthorized if authentication fails
  if (!auth.authenticated) {
    return unauthorized();
  }
  
  const { id } = params;
  
  try {
    // Check if announcement exists
    const { data: existingAnnouncement, error: checkError } = await supabase
      .from('announcements')
      .select('announcement_id')
      .eq('announcement_id', id)
      .single();
    
    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return NextResponse.json(
          {
            success: false,
            message: 'Announcement not found',
            timestamp: new Date().toISOString()
          },
          { status: 404 }
        );
      }
      throw checkError;
    }
    
    // Delete announcement
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('announcement_id', id);
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      message: 'Announcement deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'An error occurred while deleting the announcement',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 