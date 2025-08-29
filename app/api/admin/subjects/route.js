import { NextResponse } from "next/server";
import { supabase } from "@/utils/supabaseClient";
import { authenticateAdmin, unauthorized } from "@/lib/auth";

function ok(body, status = 200) {
  return NextResponse.json({ success: true, ...body, timestamp: new Date().toISOString() }, { status });
}
function err(code, message, status = 400, details) {
  return NextResponse.json({ success: false, error: { code, message, details }, timestamp: new Date().toISOString() }, { status });
}

// GET /api/admin/subjects
// Get list of subjects for filters and form options
export async function GET(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();
  
  try {
    
    let query = supabase
      .from('subject')
      .select(`
        subject_id,
        name
      `)
      .order('name', { ascending: true });
    
    const { data: subjects, error } = await query;
    
    if (error) return err('INTERNAL_ERROR', 'Failed to fetch subjects', 500);
    
    const items = (subjects || []).map(s => ({
      subjectId: s.subject_id,
      name: s.name
    }));
    
    return ok({
      data: { subjects: items },
      message: "Subjects retrieved successfully",
    });
  } catch (e) {
    console.error('GET subjects error:', e);
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}

// POST /api/admin/subjects
// Create a new subject
export async function POST(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const body = await req.json();
    const { name } = body || {};

    // Validate required fields
    if (!name) {
      return err('VALIDATION_ERROR', 'Subject name is required', 400);
    }

    // Check if subject with same name already exists
    const { data: existingSubject } = await supabase
      .from('subject')
      .select('subject_id')
      .eq('name', name)
      .maybeSingle();

    if (existingSubject) {
      return err('SUBJECT_ALREADY_EXISTS', 'Subject with this name already exists', 409);
    }

    // Prepare insert data
    const insertData = {
      name: name
    };

    // Create the subject
    const { data: newSubject, error: insertError } = await supabase
      .from('subject')
      .insert([insertData])
      .select('subject_id, name')
      .maybeSingle();

    if (insertError) {
      console.error('Subject creation error:', insertError);
      return err('INTERNAL_ERROR', 'Failed to create subject', 500);
    }

    const response = {
      subjectId: newSubject.subject_id,
      name: newSubject.name,
    };

    return ok({ 
      data: response, 
      message: 'Subject created successfully' 
    }, 201);

  } catch (e) {
    console.error('POST subject creation error:', e);
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}
