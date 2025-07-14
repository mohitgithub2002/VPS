/**
 * Admin Student Details API Routes
 * --------------------------
 * This API provides endpoints for managing individual student data,
 * including retrieving details, updating, and deleting student records.
 * 
 * Authentication:
 * - Requires valid admin authentication
 * - Access restricted to authenticated administrators only
 * 
 * Response Format for GET:
 * {
 *   success: boolean,
 *   data: {
 *     id: string,
 *     name: string,
 *     class: string,
 *     section: string,
 *     ...other student details
 *     attendance: {...},
 *     fees: {...},
 *     ...
 *   },
 *   timestamp: string
 * }
 * 
 * Error Handling:
 * - Returns 401 for unauthorized access
 * - Returns 404 for non-existent student
 * - Returns 500 for server-side errors with error logging
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

/**
 * GET handler for student details endpoint
 * Retrieves detailed information about a specific student
 */
export async function GET(req, { params }) {
  // Authenticate the incoming request
  const auth = await authenticateAdmin(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    // Await the params object
    const { studentId } = await params;
    
    if (!studentId) {
      return NextResponse.json({ 
        success: false, 
        message: "Student ID is required" 
      }, { status: 400 });
    }

    // Get student details with enrollment and classroom data
    const { data: student, error } = await supabase
      .from('students')
      .select(`
        student_id,
        name,
        father_name,
        mother_name,
        date_of_birth,
        mobile,
        email,
        address,
        gender,
        status,
        medium,
        created_at,
        nic_id,
        student_enrollment:student_enrollment(
          enrollment_id, 
          roll_no,
          admission_date,
          session_id,
          classrooms:classroom_id(
            classroom_id,
            class,
            section,
            id
          )
        )
      `)
      .eq('student_id', studentId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ 
          success: false, 
          message: `Student with ID ${studentId} not found`,
          status: 404
        }, { status: 404 });
      }
      throw error;
    }
    
    if (!student) {
      return NextResponse.json({ 
        success: false, 
        message: `Student with ID ${studentId} not found`,
        status: 404
      }, { status: 404 });
    }
    
    // Get additional data in parallel for the student
    const enrollment = student.student_enrollment?.[0] || {};
    const classroom = enrollment.classrooms || {};
    const sessionId = enrollment.session_id;
    const classroomId = classroom.classroom_id;
    const enrollmentId = enrollment.enrollment_id;
    // Get attendance data
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('attendance')
      .select('date, status, remark')
      .eq('enrollment_id', enrollmentId)
      .order('date', { ascending: false })
      .limit(30);
    
    if (attendanceError) throw attendanceError;
    
    // Process attendance data
    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    
    attendanceData?.forEach(record => {
      if (record.status === 'Present') presentCount++;
      else if (record.status === 'Absent') absentCount++;
      else if (record.status === 'Leave') leaveCount++;
    });
    
    const totalAttendanceDays = presentCount + absentCount + leaveCount;
    const attendancePercentage = totalAttendanceDays > 0 
      ? Math.round((presentCount / totalAttendanceDays) * 1000) / 10 
      : 0;
    
    // // Get subjects for the student's class
    // const { data: subjectsData, error: subjectsError } = await supabase
    //   .from('subjects')
    //   .select('subject_name')
    //   .eq('classroom_id', classroomId);
    
    // if (subjectsError) throw subjectsError;
    
    // Get exam results for the student
    /* Commenting out results data retrieval
    const { data: resultsData, error: resultsError } = await supabase
      .from('exam_results')
      .select(`
        exam_id,
        marks,
        max_marks,
        grade,
        remarks,
        exams:exam_id(
          exam_name,
          term,
          academic_year,
          subjects:subject_id(
            subject_name
          )
        )
      `)
      .eq('student_id', studentId);
    
    if (resultsError) throw resultsError;
    */
    
    // Get fee data for the student
    /* Commenting out fees data retrieval
    const { data: feesData, error: feesError } = await supabase
      .from('fee_payments')
      .select(`
        payment_id,
        amount,
        status,
        due_date,
        payment_date,
        receipt_no,
        payment_mode,
        quarter
      `)
      .eq('student_id', studentId)
      .order('payment_date', { ascending: false });
    
    if (feesError) throw feesError;
    
    // Calculate fee summary
    let totalFees = 0;
    let paidFees = 0;
    let lastPaid = null;
    
    feesData?.forEach(fee => {
      totalFees += fee.amount;
      
      if (fee.status === 'Completed') {
        paidFees += fee.amount;
        
        if (!lastPaid || new Date(fee.payment_date) > new Date(lastPaid)) {
          lastPaid = fee.payment_date;
        }
      }
    });
    */
    
    // Transform data to match the required response format
    const transformedStudent = {
      id: student.student_id,
      name: student.name,
      class: classroom.class || '',
      section: classroom.section || '',
      rollNo: enrollment.roll_no || '',
      gender: student.gender,
      fatherName: student.father_name,
      motherName: student.mother_name,
      dob: student.date_of_birth,
      address: student.address,
      mobile: student.mobile,
      email: student.email,
      status: student.status,
      admissionDate: enrollment.admission_date,
      medium: student.medium,
      nicId: student.nic_id,
      attendance: {
        present: presentCount,
        absent: absentCount,
        leave: leaveCount,
        percentage: attendancePercentage,
        history: attendanceData?.map(record => ({
          date: record.date,
          status: record.status.toLowerCase(),
          remark: record.remark || ''
        })) || []
      },
      /* Commenting out fees and results in response
      fees: {
        total: totalFees,
        paid: paidFees,
        due: totalFees - paidFees,
        lastPaid: lastPaid,
        history: feesData?.map(fee => ({
          id: fee.payment_id,
          amount: fee.amount,
          date: fee.payment_date || fee.due_date,
          mode: fee.payment_mode || 'Online',
          receipt: fee.receipt_no || '',
          status: fee.status,
          quarter: fee.quarter
        })) || []
      },
      subjects: subjectsData?.map(subject => subject.subject_name) || [],
      results: resultsData?.map(result => ({
        examId: result.exam_id,
        marks: result.marks,
        maxMarks: result.max_marks,
        grade: result.grade,
        remarks: result.remarks,
        examName: result.exams?.exam_name,
        term: result.exams?.term,
        academicYear: result.exams?.academic_year,
        subject: result.exams?.subjects?.subject_name
      })) || []
      */
    };

    // Return the response
    return NextResponse.json({
      success: true,
      data: transformedStudent,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Admin Student Details API error:', error);
    
    // Return a generic error response
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch student details',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * PUT handler for student details endpoint
 * Updates an existing student record
 */
export async function PUT(req, { params }) {
  // Authenticate the incoming request
  const auth = await authenticateAdmin(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    // Await the params object
    const { studentId } = await params;
    
    if (!studentId) {
      return NextResponse.json({ 
        success: false, 
        message: "Student ID is required" 
      }, { status: 400 });
    }

    // Parse request body
    const body = await req.json();

    // Validate date format if provided
    if (body.dob) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(body.dob)) {
        return NextResponse.json({ 
          success: false, 
          message: "Date of birth must be in YYYY-MM-DD format" 
        }, { status: 400 });
      }
    }
    
    // Check if student exists
    const { data: existingStudent, error: checkError } = await supabase
      .from('students')
      .select('student_id')
      .eq('student_id', studentId)
      .single();
    
    if (checkError || !existingStudent) {
      return NextResponse.json({ 
        success: false, 
        message: `Student with ID ${studentId} not found`,
        status: 404
      }, { status: 404 });
    }
    
    // Get current enrollment for the student
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('student_enrollment')
      .select('enrollment_id, classroom_id, classrooms:classroom_id(class, section)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (enrollmentError && enrollmentError.code !== 'PGRST116') throw enrollmentError;
    
    // Prepare updates for student and enrollment
    const studentUpdates = {};
    
    // Map fields from request to database columns
    if (body.name) studentUpdates.name = body.name;
    if (body.fatherName) studentUpdates.father_name = body.fatherName;
    if (body.motherName) studentUpdates.mother_name = body.motherName;
    if (body.dob) studentUpdates.date_of_birth = body.dob;
    if (body.email !== undefined) studentUpdates.email = body.email;
    if (body.address !== undefined) studentUpdates.address = body.address;
    if (body.gender) studentUpdates.gender = body.gender;
    if (body.status) studentUpdates.status = body.status;
    if (body.medium) studentUpdates.medium = body.medium;
    if (body.nicId) studentUpdates.nic_id = body.nicId;
    if (body.caste) studentUpdates.caste = body.caste;
    if (body.sr_no) studentUpdates.sr_no = body.sr_no;
    
    // Update student record if there are changes
    if (Object.keys(studentUpdates).length > 0) {
      const { error: updateError } = await supabase
        .from('students')
        .update(studentUpdates)
        .eq('student_id', studentId);
      
      if (updateError) throw updateError;
    }
    
    // Check if class or section needs to be updated
    if ((body.class && body.class !== enrollment?.classrooms?.class) || 
        (body.section && body.section !== enrollment?.classrooms?.section)) {
      
      // Get current session
      const { data: currentSession, error: sessionError } = await supabase
        .from('sessions')
        .select('session_id')
        .order('start_date', { ascending: false })
        .limit(1)
        .single();
      
      if (sessionError) throw sessionError;
      
      // Find or create the classroom for the updated class/section
      let classroomQuery = supabase
        .from('classrooms')
        .select('classroom_id');
      
      if (body.class) classroomQuery = classroomQuery.eq('class', body.class);
      else classroomQuery = classroomQuery.eq('class', enrollment.classrooms.class);
      
      if (body.section) classroomQuery = classroomQuery.eq('section', body.section);
      else classroomQuery = classroomQuery.eq('section', enrollment.classrooms.section);

      if (body.medium) classroomQuery = classroomQuery.eq('medium', body.medium);
      else classroomQuery = classroomQuery.eq('medium', enrollment.classrooms.medium);
      
      classroomQuery = classroomQuery.eq('session_id', currentSession.session_id);
      
      const { data: classroom, error: classroomError } = await classroomQuery.single();
      
      let classroomId;
      
      if (classroomError && classroomError.code === 'PGRST116') {
        // Classroom doesn't exist, create it
        const { data: newClassroom, error: createError } = await supabase
          .from('classrooms')
          .insert({
            session_id: currentSession.session_id,
            class: body.class || enrollment.classrooms.class,
            section: body.section || enrollment.classrooms.section,
            medium: body.medium || 'English'
          })
          .select('classroom_id')
          .single();
        
        if (createError) throw createError;
        classroomId = newClassroom.classroom_id;
      } else if (classroomError) {
        throw classroomError;
      } else {
        classroomId = classroom.classroom_id;
      }
      
      // Update enrollment with new classroom
      const { error: updateEnrollmentError } = await supabase
        .from('student_enrollment')
        .update({ classroom_id: classroomId })
        .eq('enrollment_id', enrollment.enrollment_id);
      
      if (updateEnrollmentError) throw updateEnrollmentError;
    }
    
    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        id: studentId,
        message: 'Student updated successfully'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Admin Student Update API error:', error);
    
    // Return a generic error response
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to update student record',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE handler for student details endpoint
 * Deletes a student record
 */
export async function DELETE(req, { params }) {
  // Authenticate the incoming request
  const auth = await authenticateAdmin(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  const { studentId } = await params;
  
  if (!studentId) {
    return NextResponse.json({ 
      success: false, 
      message: "Student ID is required" 
    }, { status: 400 });
  }

  try {
    // Check if student exists
    const { data: existingStudent, error: checkError } = await supabase
      .from('students')
      .select('student_id')
      .eq('student_id', studentId)
      .single();
    
    if (checkError || !existingStudent) {
      return NextResponse.json({ 
        success: false, 
        message: `Student with ID ${studentId} not found`,
        status: 404
      }, { status: 404 });
    }
    
    // Delete the student record (this will cascade to enrollments due to foreign key)
    const { error: deleteError } = await supabase
      .from('students')
      .delete()
      .eq('student_id', studentId);
    
    if (deleteError) throw deleteError;
    
    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        id: studentId,
        message: 'Student deleted successfully'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Admin Student Delete API error:', error);
    
    // Return a generic error response
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to delete student record',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 