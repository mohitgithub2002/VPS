import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

/**
 * GET handler for admin diary-notes endpoint
 * Retrieves diary entries with pagination and filtering
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
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const search = url.searchParams.get('search'); // Universal search parameter
  const entryType = url.searchParams.get('entryType');
  const classroomId = url.searchParams.get('classroomId');
  const date = url.searchParams.get('date');
  
  console.log("Request parameters:", { page, limit, search, entryType, classroomId, date });
  
  // Calculate pagination range values for Supabase query
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  
  try {
    // If searching, we need to handle it differently to include student and teacher names
    if (search) {
      console.log("Performing search across all fields:", search);
      
      // Step 1: Find entries matching subject or content
      const { data: contentMatches, error: contentError } = await supabase
        .from('diary_entries')
        .select(`
          entry_id,
          subject,
          content,
          created_at,
          entry_type,
          classroom_id,
          enrollment_id,
          teacher_id
        `)
        .or(`subject.ilike.%${search}%,content.ilike.%${search}%`)
        .order('created_at', { ascending: false });
      
      if (contentError) {
        console.error('Content search error:', contentError);
        throw contentError;
      }
      
      // Step 2: Find student IDs matching the search term
      const { data: matchingStudents, error: studentError } = await supabase
        .from('students')
        .select('student_id, name')
        .ilike('name', `%${search}%`);
      
      if (studentError) {
        console.error('Student search error:', studentError);
        throw studentError;
      }
      
      // Step 3: Find enrollments for matching students
      let enrollmentMatches = [];
      if (matchingStudents && matchingStudents.length > 0) {
        const studentIds = matchingStudents.map(s => s.student_id);
        console.log("Found matching students:", studentIds.length);
        
        const { data: matchingEnrollments, error: enrollmentError } = await supabase
          .from('student_enrollment')
          .select('enrollment_id, student_id')
          .in('student_id', studentIds);
        
        if (enrollmentError) {
          console.error('Enrollment search error:', enrollmentError);
          throw enrollmentError;
        }
        
        if (matchingEnrollments && matchingEnrollments.length > 0) {
          const enrollmentIds = matchingEnrollments.map(e => e.enrollment_id);
          console.log("Found matching enrollments:", enrollmentIds.length);
          
          const { data: studentEntries, error: studentEntriesError } = await supabase
            .from('diary_entries')
            .select(`
              entry_id,
              subject,
              content,
              created_at,
              entry_type,
              classroom_id,
              enrollment_id,
              teacher_id
            `)
            .in('enrollment_id', enrollmentIds)
            .order('created_at', { ascending: false });
          
          if (studentEntriesError) {
            console.error('Student entries search error:', studentEntriesError);
            throw studentEntriesError;
          }
          
          enrollmentMatches = studentEntries || [];
          console.log("Found diary entries for matching students:", enrollmentMatches.length);
        }
      }
      
      // Step 4: Find teacher IDs matching the search term
      const { data: matchingTeachers, error: teacherError } = await supabase
        .from('teachers')
        .select('teacher_id, name')
        .ilike('name', `%${search}%`);
      
      if (teacherError) {
        console.error('Teacher search error:', teacherError);
        throw teacherError;
      }
      
      // Step 5: Find entries from matching teachers
      let teacherMatches = [];
      if (matchingTeachers && matchingTeachers.length > 0) {
        const teacherIds = matchingTeachers.map(t => t.teacher_id);
        console.log("Found matching teachers:", teacherIds.length);
        
        const { data: teacherEntries, error: teacherEntriesError } = await supabase
          .from('diary_entries')
          .select(`
            entry_id,
            subject,
            content,
            created_at,
            entry_type,
            classroom_id,
            enrollment_id,
            teacher_id
          `)
          .in('teacher_id', teacherIds)
          .order('created_at', { ascending: false });
        
        if (teacherEntriesError) {
          console.error('Teacher entries search error:', teacherEntriesError);
          throw teacherEntriesError;
        }
        
        teacherMatches = teacherEntries || [];
        console.log("Found diary entries for matching teachers:", teacherMatches.length);
      }
      
      // Step 6: Combine all matches and remove duplicates
      const allEntriesMap = new Map();
      
      // Add content matches
      (contentMatches || []).forEach(entry => {
        allEntriesMap.set(entry.entry_id, entry);
      });
      
      // Add student matches
      enrollmentMatches.forEach(entry => {
        allEntriesMap.set(entry.entry_id, entry);
      });
      
      // Add teacher matches
      teacherMatches.forEach(entry => {
        allEntriesMap.set(entry.entry_id, entry);
      });
      
      // Convert map back to array
      let diaryEntries = Array.from(allEntriesMap.values());
      
      // Apply additional filters
      if (classroomId) {
        diaryEntries = diaryEntries.filter(entry => entry.classroom_id === parseInt(classroomId));
      }
      
      if (date) {
        diaryEntries = diaryEntries.filter(entry => entry.created_at === date);
      }
      
      if (entryType) {
        diaryEntries = diaryEntries.filter(entry => entry.entry_type === entryType);
      }
      
      // Sort by created_at (descending)
      diaryEntries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      // Apply pagination
      const totalCount = diaryEntries.length;
      diaryEntries = diaryEntries.slice(from, to + 1);
      
      console.log("Combined unique entries after filtering:", diaryEntries.length);
      
      // Now enrich the entries with related data
      // Rest of the enrichment code follows...
      
      // Create a map to store reference data for enrichment
      const referenceData = {
        students: {},
        teachers: {},
        classrooms: {},
        enrollments: {}
      };
      
      // Collect IDs needed for enrichment
      const neededIds = {
        classroomIds: [...new Set(diaryEntries.map(entry => entry.classroom_id).filter(Boolean))],
        teacherIds: [...new Set(diaryEntries.map(entry => entry.teacher_id).filter(Boolean))],
        enrollmentIds: [...new Set(diaryEntries.map(entry => entry.enrollment_id).filter(Boolean))]
      };
      
      // Fetch classrooms
      if (neededIds.classroomIds.length > 0) {
        const { data: classroomData } = await supabase
          .from('classrooms')
          .select('classroom_id, class, section, medium')
          .in('classroom_id', neededIds.classroomIds);
          
        if (classroomData) {
          referenceData.classrooms = classroomData.reduce((acc, classroom) => {
            acc[classroom.classroom_id] = classroom;
            return acc;
          }, {});
        }
      }
      
      // Fetch teachers
      if (neededIds.teacherIds.length > 0) {
        const { data: teacherData } = await supabase
          .from('teachers')
          .select('teacher_id, name')
          .in('teacher_id', neededIds.teacherIds);
          
        if (teacherData) {
          referenceData.teachers = teacherData.reduce((acc, teacher) => {
            acc[teacher.teacher_id] = teacher;
            return acc;
          }, {});
        }
      }
      
      // Fetch enrollments and then students
      if (neededIds.enrollmentIds.length > 0) {
        const { data: enrollmentData } = await supabase
          .from('student_enrollment')
          .select('enrollment_id, student_id')
          .in('enrollment_id', neededIds.enrollmentIds);
          
        if (enrollmentData) {
          referenceData.enrollments = enrollmentData.reduce((acc, enrollment) => {
            acc[enrollment.enrollment_id] = enrollment;
            return acc;
          }, {});
          
          const studentIds = [...new Set(enrollmentData.map(e => e.student_id).filter(Boolean))];
          
          if (studentIds.length > 0) {
            const { data: studentData } = await supabase
              .from('students')
              .select('student_id, name')
              .in('student_id', studentIds);
              
            if (studentData) {
              referenceData.students = studentData.reduce((acc, student) => {
                acc[student.student_id] = student;
                return acc;
              }, {});
            }
          }
        }
      }
      
      // Enrich each entry with related data
      const enrichedEntries = diaryEntries.map(entry => {
        const enriched = { ...entry };
        
        // Add classroom data
        if (entry.classroom_id && referenceData.classrooms[entry.classroom_id]) {
          enriched.classrooms = referenceData.classrooms[entry.classroom_id];
        }
        
        // Add teacher data
        if (entry.teacher_id && referenceData.teachers[entry.teacher_id]) {
          enriched.teachers = referenceData.teachers[entry.teacher_id];
        }
        
        // Add enrollment and student data
        if (entry.enrollment_id && referenceData.enrollments[entry.enrollment_id]) {
          enriched.student_enrollment = referenceData.enrollments[entry.enrollment_id];
          
          // Add student data if available
          const studentId = referenceData.enrollments[entry.enrollment_id].student_id;
          if (studentId && referenceData.students[studentId]) {
            enriched.student_enrollment.students = referenceData.students[studentId];
          }
        }
        
        return enriched;
      });
      
      // Transform data to match the API documentation format
      const transformedEntries = enrichedEntries.map(entry => ({
        id: entry.entry_id.toString(),
        subject: entry.subject,
        content: entry.content,
        date: entry.created_at,
        entryType: entry.entry_type,
        classroomId: entry.classroom_id,
        classroomDetails: entry.classrooms ? {
          className: entry.classrooms.class || 'Unknown',
          section: entry.classrooms.section || 'Unknown',
          medium: entry.classrooms.medium || 'Unknown'
        } : null,
        enrollmentId: entry.enrollment_id,
        studentName: entry.student_enrollment?.students?.name || null,
        teacherId: entry.teacher_id,
        teacherName: entry.teachers?.name || null
      }));
      
      // Calculate pagination values
      const totalPages = Math.ceil(totalCount / limit);
      
      console.log("Final transformed entries:", transformedEntries.length);
      
      // Return success response with data and pagination
      return NextResponse.json({
        success: true,
        data: {
          diaryEntries: transformedEntries,
          pagination: {
            total: totalCount,
            pages: totalPages,
            page,
            limit,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        },
        timestamp: new Date().toISOString()
      });
    } else {
      // If not searching, use the simpler approach
      // Standard count query
      let countQuery = supabase
        .from('diary_entries')
        .select('*', { count: 'exact', head: true });
      
      // Apply filters to count query
      if (classroomId) {
        countQuery = countQuery.eq('classroom_id', classroomId);
      }
      
      if (date) {
        countQuery = countQuery.eq('created_at', date);
      }
      
      if (entryType) {
        countQuery = countQuery.eq('entry_type', entryType);
      }
      
      // Execute count query
      const { count, error: countError } = await countQuery;
      
      if (countError) {
        console.error('Count query error:', countError);
        throw countError;
      }
      
      console.log("Total count:", count);
      
      // Get basic diary entries
      let dataQuery = supabase
        .from('diary_entries')
        .select(`
          entry_id,
          subject,
          content,
          created_at,
          entry_type,
          classroom_id,
          enrollment_id,
          teacher_id
        `);
      
      // Apply filters to data query
      console.log("classroomId", classroomId);
      if (classroomId) {
        dataQuery = dataQuery.eq('classroom_id', classroomId);
      }
      
      if (date) {
        dataQuery = dataQuery.eq('created_at', date);
      }
      
      if (entryType) {
        dataQuery = dataQuery.eq('entry_type', entryType);
      }
      
      // Add ordering and pagination
      dataQuery = dataQuery
        .order('created_at', { ascending: false })
        .range(from, to);
      
      // Execute data query
      const { data: diaryEntries, error } = await dataQuery;
      
      if (error) {
        console.error('Data query error:', error);
        throw error;
      }
      
      console.log("Retrieved diary entries:", diaryEntries?.length || 0);
      
      // Exit early if no entries
      if (!diaryEntries || diaryEntries.length === 0) {
        console.log("No diary entries found");
        return NextResponse.json({
          success: true,
          data: {
            diaryEntries: [],
            pagination: {
              total: 0,
              pages: 0,
              page,
              limit,
              hasNext: false,
              hasPrev: page > 1
            }
          },
          timestamp: new Date().toISOString()
        });
      }
      
      // Fetch all needed classrooms in one query
      const classroomIds = [...new Set(diaryEntries.map(entry => entry.classroom_id).filter(Boolean))];
      let classrooms = {};
      
      if (classroomIds.length > 0) {
        const { data: classroomData } = await supabase
          .from('classrooms')
          .select('classroom_id, class, section, medium')
          .in('classroom_id', classroomIds);
          
        if (classroomData) {
          classrooms = classroomData.reduce((acc, classroom) => {
            acc[classroom.classroom_id] = classroom;
            return acc;
          }, {});
        }
      }
      
      // Fetch all needed teachers in one query
      const teacherIds = [...new Set(diaryEntries.map(entry => entry.teacher_id).filter(Boolean))];
      let teachers = {};
      
      if (teacherIds.length > 0) {
        const { data: teacherData } = await supabase
          .from('teachers')
          .select('teacher_id, name')
          .in('teacher_id', teacherIds);
          
        if (teacherData) {
          teachers = teacherData.reduce((acc, teacher) => {
            acc[teacher.teacher_id] = teacher;
            return acc;
          }, {});
        }
      }
      
      // Fetch all needed enrollments in one query
      const enrollmentIds = [...new Set(diaryEntries.map(entry => entry.enrollment_id).filter(Boolean))];
      let enrollments = {};
      let studentIds = [];
      
      if (enrollmentIds.length > 0) {
        const { data: enrollmentData } = await supabase
          .from('student_enrollment')
          .select('enrollment_id, student_id')
          .in('enrollment_id', enrollmentIds);
          
        if (enrollmentData) {
          enrollments = enrollmentData.reduce((acc, enrollment) => {
            acc[enrollment.enrollment_id] = enrollment;
            if (enrollment.student_id) {
              studentIds.push(enrollment.student_id);
            }
            return acc;
          }, {});
        }
      }
      
      // Fetch all needed students in one query
      let students = {};
      
      if (studentIds.length > 0) {
        const { data: studentData } = await supabase
          .from('students')
          .select('student_id, name')
          .in('student_id', studentIds);
          
        if (studentData) {
          students = studentData.reduce((acc, student) => {
            acc[student.student_id] = student;
            return acc;
          }, {});
        }
      }
      
      // Now enrich each diary entry with the fetched data
      const enrichedEntries = [];
      
      for (const entry of diaryEntries) {
        const enrichedEntry = { ...entry };
        
        // Add classroom data
        if (entry.classroom_id && classrooms[entry.classroom_id]) {
          enrichedEntry.classrooms = classrooms[entry.classroom_id];
        }
        
        // Add teacher data
        if (entry.teacher_id && teachers[entry.teacher_id]) {
          enrichedEntry.teachers = teachers[entry.teacher_id];
        }
        
        // Add enrollment and student data
        if (entry.enrollment_id && enrollments[entry.enrollment_id]) {
          enrichedEntry.student_enrollment = enrollments[entry.enrollment_id];
          
          // Add student data if available
          const studentId = enrollments[entry.enrollment_id].student_id;
          if (studentId && students[studentId]) {
            enrichedEntry.student_enrollment.students = students[studentId];
          }
        }
        
        enrichedEntries.push(enrichedEntry);
      }
      
      console.log("Enriched entries:", enrichedEntries.length);
      
      // Transform data to match the API documentation format
      const transformedEntries = enrichedEntries.map(entry => ({
        id: entry.entry_id.toString(),
        subject: entry.subject,
        content: entry.content,
        date: entry.created_at,
        entryType: entry.entry_type,
        classroomId: entry.classroom_id,
        classroomDetails: entry.classrooms ? {
          className: entry.classrooms.class || 'Unknown',
          section: entry.classrooms.section || 'Unknown',
          medium: entry.classrooms.medium || 'Unknown'
        } : null,
        enrollmentId: entry.enrollment_id,
        studentName: entry.student_enrollment?.students?.name || null,
        teacherId: entry.teacher_id,
        teacherName: entry.teachers?.name || null
      }));
      
      // Calculate pagination values
      const totalPages = Math.ceil(count / limit);
      
      console.log("Final transformed entries:", transformedEntries.length);
      
      // Return success response with data and pagination
      return NextResponse.json({
        success: true,
        data: {
          diaryEntries: transformedEntries,
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
    }
  } catch (error) {
    console.error('Error fetching diary entries:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'An error occurred while fetching diary entries',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler for admin diary-notes endpoint
 * Creates a new diary entry
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
    
    if (!body.subject) {
      errors.push({ field: 'subject', message: 'Subject is required' });
    } else if (body.subject.length < 3 || body.subject.length > 100) {
      errors.push({ field: 'subject', message: 'Subject must be between 3 and 100 characters' });
    }
    
    if (!body.content) {
      errors.push({ field: 'content', message: 'Content is required' });
    } else if (body.content.length < 10) {
      errors.push({ field: 'content', message: 'Content must be at least 10 characters' });
    }
    
    if (!body.classroomId) {
      errors.push({ field: 'classroomId', message: 'Classroom ID is required' });
    }
    
    if (body.entryType && !['Personal', 'Broadcast'].includes(body.entryType)) {
      errors.push({ field: 'entryType', message: 'Entry type must be either Personal or Broadcast' });
    }
    
    // For Personal type, enrollment_id is required
    if ((body.entryType === 'Personal' || !body.entryType) && !body.enrollmentId) {
      errors.push({ field: 'enrollmentId', message: 'Enrollment ID is required for Personal diary entries' });
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
    
    // Set entry type default if not provided
    const entryType = body.entryType || 'Personal';
    
    // Insert new diary entry
    const { data, error } = await supabase
      .from('diary_entries')
      .insert([
        {
          subject: body.subject,
          content: body.content,
          entry_type: entryType,
          classroom_id: body.classroomId,
          enrollment_id: entryType === 'Personal' ? body.enrollmentId : null,
          teacher_id: body.teacherId || null,
          created_at: body.date || new Date().toISOString().split('T')[0] // Default to today
        }
      ])
      .select();

    if (error) throw error;
    
    // Transform response to match API documentation format
    const createdEntry = {
      id: data[0].entry_id.toString(),
      subject: data[0].subject,
      content: data[0].content,
      date: data[0].created_at,
      entryType: data[0].entry_type,
      classroomId: data[0].classroom_id,
      enrollmentId: data[0].enrollment_id,
      teacherId: data[0].teacher_id
    };

    return NextResponse.json({
      success: true,
      data: createdEntry,
      message: 'Diary entry created successfully',
      timestamp: new Date().toISOString()
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating diary entry:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'An error occurred while creating the diary entry',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
