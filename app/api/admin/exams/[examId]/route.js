import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

function ok(body, status = 200) {
  return NextResponse.json({ success: true, ...body, timestamp: new Date().toISOString() }, { status });
}
function err(code, message, status = 400, details) {
  return NextResponse.json({ success: false, error: { code, message, details }, timestamp: new Date().toISOString() }, { status });
}

// GET /api/admin/exams/[examId]
export async function GET(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();
  const { examId } = await params;
  if (!examId) return err('EXAM_NOT_FOUND', 'Exam not found', 404);

  try {
    const { searchParams } = new URL(req.url);
    const includeResults = searchParams.get('includeResults') === 'true';
    const includeStatistics = searchParams.get('includeStatistics') !== 'false'; // default true
    const tab = searchParams.get('tab');

    // Get exam details
    const { data: exam, error } = await supabase
      .from('exam')
      .select('exam_id, name, start_date, is_declared, classroom_id, classroom:classroom_id(class, section), exam_type:exam_type_id(name, code)')
      .eq('exam_id', examId)
      .maybeSingle();
    if (error) return err('INTERNAL_ERROR', 'Failed to fetch exam', 500);
    if (!exam) return err('EXAM_NOT_FOUND', 'Exam not found', 404);

    // Get subjects with marking progress
    const { data: marks } = await supabase
      .from('exam_mark')
      .select('subject_id, max_marks, marks_obtained, enrollment_id, is_absent')
      .eq('exam_id', examId);

    const subjectMap = new Map();
    (marks || []).forEach(m => {
      if (!subjectMap.has(m.subject_id)) {
        subjectMap.set(m.subject_id, { 
          subjectId: m.subject_id, 
          maxMarks: m.max_marks, 
          markedStudents: 0, 
          totalStudents: 0,
          absentStudents: 0
        });
      }
      const entry = subjectMap.get(m.subject_id);
      entry.totalStudents += 1;
      if (m.is_absent === true) {
        entry.absentStudents += 1;
      } else if (m.marks_obtained !== null) {
        entry.markedStudents += 1;
      }
    });

    const subjects = Array.from(subjectMap.values()).map(s => ({
      subjectId: s.subjectId,
      subjectName: s.subjectId, // Will be enhanced with subject names if needed
      maxMarks: s.maxMarks,
      markedStudents: s.markedStudents,
      totalStudents: s.totalStudents,
      absentStudents: s.absentStudents,
      markingProgress: s.totalStudents ? Number(((s.markedStudents / s.totalStudents) * 100).toFixed(2)) : 0
    }));

    // Get subject names
    const subjectIds = Array.from(subjectMap.keys());
    if (subjectIds.length > 0) {
      const { data: subjectNames } = await supabase
        .from('subject')
        .select('subject_id, name')
        .in('subject_id', subjectIds);
      
      if (subjectNames) {
        const nameMap = new Map(subjectNames.map(s => [s.subject_id, s.name]));
        subjects.forEach(s => {
          s.subjectName = nameMap.get(s.subjectId) || s.subjectId;
        });
      }
    }

    let students = [];
    let statistics = null;

    if (includeResults || includeStatistics) {
      // Get unique enrollment IDs from exam_mark table (only students who have marks)
      const enrollmentIdsFromMarks = [...new Set((marks || []).map(m => m.enrollment_id))];
      
      if (enrollmentIdsFromMarks.length === 0) {
        // No marks exist for this exam yet
        if (includeStatistics) {
          statistics = {
            totalStudents: 0,
            completedStudents: 0,
            absentStudents: 0,
            pendingStudents: 0,
            averageMarks: 0,
            averagePercentage: 0,
            highestMarks: 0,
            lowestMarks: 0,
            passPercentage: 0,
            gradeDistribution: {}
          };
        }
      } else {
        // Get enrollments only for students who have marks in exam_mark table
        const { data: enrollments } = await supabase
          .from('student_enrollment')
          .select(`
            enrollment_id,
            roll_no,
            students:student_id(student_id, name)
          `)
          .in('enrollment_id', enrollmentIdsFromMarks);

      if (enrollments && enrollments.length > 0) {
        const enrollmentIds = enrollments.map(e => e.enrollment_id);

        // Get exam summaries for statistics
        const { data: summaries } = await supabase
          .from('exam_summary')
          .select('enrollment_id, total_marks, max_marks, percentage, rank, grade')
          .eq('exam_id', examId)
          .in('enrollment_id', enrollmentIds);

                 // Get all marks for student results including absent status
         const { data: allMarks } = await supabase
           .from('exam_mark')
           .select('enrollment_id, subject_id, marks_obtained, max_marks, is_absent, remark')
           .eq('exam_id', examId)
           .in('enrollment_id', enrollmentIds);

                  // Build student results
         if (includeResults) {
           students = enrollments.map(enrollment => {
             const summary = summaries?.find(s => s.enrollment_id === enrollment.enrollment_id);
             const studentMarks = allMarks?.filter(m => m.enrollment_id === enrollment.enrollment_id) || [];
             
             // Check if student is absent for any subject
             const isAbsent = studentMarks.some(m => m.is_absent === true);
             
             // Check if student is partially absent (some subjects absent, some present)
             const absentSubjects = studentMarks.filter(m => m.is_absent === true);
             const presentSubjects = studentMarks.filter(m => m.is_absent !== true);
             const isPartiallyAbsent = absentSubjects.length > 0 && presentSubjects.length > 0;
             
             const subjectResults = subjects.map(subject => {
               const mark = studentMarks.find(m => m.subject_id === subject.subjectId);
               
               // Handle case where mark might not exist for a subject
               if (!mark) {
                 return {
                   subjectId: subject.subjectId,
                   subjectName: subject.subjectName,
                   marksObtained: null,
                   maxMarks: subject.maxMarks,
                   grade: null,
                   status: 'pending'
                 };
               }
               
               // Handle absent case
               if (mark.is_absent === true) {
                 return {
                   subjectId: subject.subjectId,
                   subjectName: subject.subjectName,
                   marksObtained: 0,
                   maxMarks: mark.max_marks ? Number(mark.max_marks) : subject.maxMarks,
                   grade: 'F',
                   status: 'absent',
                   remark: mark.remark || 'Absent'
                 };
               }
               
               // Handle marked case
               return {
                 subjectId: subject.subjectId,
                 subjectName: subject.subjectName,
                 marksObtained: mark.marks_obtained !== null ? Number(mark.marks_obtained) : null,
                 maxMarks: mark.max_marks ? Number(mark.max_marks) : subject.maxMarks,
                 grade: mark.marks_obtained !== null ? computeGrade(mark.marks_obtained, mark.max_marks) : null,
                 status: mark.marks_obtained !== null ? 'marked' : 'pending',
                 remark: mark.remark || null
               };
             });

             // Calculate totals only for non-absent subjects
             const validSubjectResults = subjectResults.filter(s => s.status !== 'absent');
             const totalMarks = summary?.total_marks ? Number(summary.total_marks) : 
               validSubjectResults.reduce((sum, s) => sum + (s.marksObtained || 0), 0);
             const maxMarks = summary?.max_marks ? Number(summary.max_marks) : 
               validSubjectResults.reduce((sum, s) => sum + (s.maxMarks || 0), 0);
             const percentage = maxMarks > 0 ? Number(((totalMarks / maxMarks) * 100).toFixed(1)) : null;

            // Determine overall status
            let overallStatus = 'pending';
            const markedSubjects = validSubjectResults.filter(s => s.status === 'marked');
            const allSubjectsMarked = validSubjectResults.length > 0 && markedSubjects.length === validSubjectResults.length;
            
            if (isPartiallyAbsent) {
              overallStatus = 'partial present';
            } else if (isAbsent && absentSubjects.length === subjects.length) {
              overallStatus = 'absent';
            } else if (summary || allSubjectsMarked) {
              // Mark as completed if summary exists OR all subjects have marks entered
              overallStatus = 'completed';
            } else if (markedSubjects.length > 0) {
              // Some subjects marked but not all
              overallStatus = 'partial';
            }

                           return {
                studentId: enrollment.students?.student_id,
                studentName: enrollment.students?.name,
                rollNumber: enrollment.roll_no,
                totalMarks: summary?.total_marks ? Number(summary.total_marks) : (isPartiallyAbsent ? totalMarks : (isAbsent && absentSubjects.length === subjects.length ? 0 : totalMarks)),
                maxMarks: summary?.max_marks ? Number(summary.max_marks) : (isPartiallyAbsent ? maxMarks : (isAbsent && absentSubjects.length === subjects.length ? 0 : maxMarks)),
                percentage: summary?.percentage ? Number(summary.percentage) : (isPartiallyAbsent ? percentage : (isAbsent && absentSubjects.length === subjects.length ? 0 : percentage)),
                rank: summary?.rank || null,
                grade: summary?.grade || (isAbsent && absentSubjects.length === subjects.length ? 'F' : null),
                status: overallStatus,
                subjectResults
              };
           });
         }

                          // Build statistics
         if (includeStatistics) {
           const totalStudents = enrollments.length;
           const completedStudents = summaries?.length || 0;
           
           // Count absent students from exam_mark table
           const absentStudents = allMarks?.filter(m => m.is_absent === true)
             .reduce((acc, mark) => {
               if (!acc.has(mark.enrollment_id)) {
                 acc.add(mark.enrollment_id);
               }
               return acc;
             }, new Set()).size || 0;
           
           const pendingStudents = totalStudents - completedStudents - absentStudents;
          
           const marksArray = summaries?.map(s => Number(s.total_marks || 0)).filter(m => m > 0) || [];
           const averageMarks = marksArray.length > 0 ? 
             Number((marksArray.reduce((a, b) => a + b, 0) / marksArray.length).toFixed(1)) : 0;
           
           const percentagesArray = summaries?.map(s => Number(s.percentage || 0)).filter(p => p > 0) || [];
           const averagePercentage = percentagesArray.length > 0 ? 
             Number((percentagesArray.reduce((a, b) => a + b, 0) / percentagesArray.length).toFixed(1)) : 0;
           
           const highestMarks = marksArray.length > 0 ? Math.max(...marksArray) : 0;
           const lowestMarks = marksArray.length > 0 ? Math.min(...marksArray) : 0;
           
           // Calculate pass percentage (assuming 40% is pass)
           const passCount = percentagesArray.filter(p => p >= 40).length;
           const passPercentage = percentagesArray.length > 0 ? 
             Number(((passCount / percentagesArray.length) * 100).toFixed(2)) : 0;

           // Grade distribution
           const gradeDistribution = {};
           summaries?.forEach(s => {
             if (s.grade) {
               gradeDistribution[s.grade] = (gradeDistribution[s.grade] || 0) + 1;
             }
           });

           statistics = {
            totalStudents,
            completedStudents,
            absentStudents,
            pendingStudents,
            averageMarks,
            averagePercentage,
            highestMarks,
            lowestMarks,
            passPercentage,
            gradeDistribution
          };
        }
      }
      }
    }

    // Determine exam status
    let status = 'scheduled';
    if (exam.is_declared) {
      status = 'declared';
    } else if (new Date(exam.start_date) <= new Date()) {
      status = 'ongoing';
    }

    const response = {
      exam: {
        examId: exam.exam_id,
        examName: exam.name || exam.exam_type?.name || null,
        examType: exam.exam_type?.code || null,
        class: exam.classroom?.class || null,
        section: exam.classroom?.section || null,
        status,
        startDate: exam.start_date,
        endDate: null, // Not stored in current schema
        maxMarks: subjects.reduce((sum, s) => sum + (s.maxMarks || 0), 0),
        duration: null, // Not stored in current schema
        instructions: null, // Not stored in current schema
        subjects,
        students: includeResults ? students : undefined,
        statistics: includeStatistics ? statistics : undefined,
        createdAt: null, // Not stored in current schema
        updatedAt: null // Not stored in current schema
      }
    };

    return ok({ data: response, message: 'Exam details retrieved successfully' });
  } catch (e) {
    console.error('GET exam details error:', e);
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}

// Helper function to compute grade
function computeGrade(marks, maxMarks) {
  if (!marks || !maxMarks) return null;
  const percentage = (marks / maxMarks) * 100;
  
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C';
  if (percentage >= 40) return 'D';
  return 'F';
}

// PUT /api/admin/exams/[examId]
export async function PUT(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();
  const { examId } = params || {};
  if (!examId) return err('EXAM_NOT_FOUND', 'Exam not found', 404);

  const body = await req.json();
  try {
    const { data: existing } = await supabase
      .from('exam')
      .select('is_declared')
      .eq('exam_id', examId)
      .maybeSingle();
    if (!existing) return err('EXAM_NOT_FOUND', 'Exam not found', 404);
    

    const patch = {};
    if (body.examName) patch.name = body.examName;
    if (body.startDate) patch.start_date = body.startDate;
    if(body.endDate) patch.end_date = body.endDate;
    if (body.examType) {
      const { data: et } = await supabase
        .from('exam_type')
        .select('exam_type_id, code, name')
        .or(`code.eq.${body.examType},name.ilike.%${body.examType}%`)
        .limit(1)
        .maybeSingle();
      if (et?.exam_type_id) patch.exam_type_id = et.exam_type_id;
    }

    if (Object.keys(patch).length === 0) return ok({ data: { examId }, message: 'No changes' });

    const { data: updated, error: upErr } = await supabase
      .from('exam')
      .update(patch)
      .eq('exam_id', examId)
      .select('exam_id, name, start_date, end_date, is_declared, exam_type:exam_type_id(name, code)')
      .maybeSingle();
    if (upErr) return err('INTERNAL_ERROR', 'Failed to update exam', 500);

    const response = {
      examId: updated.exam_id,
      examName: updated.name || updated.exam_type?.name || null,
      examType: updated.exam_type?.code || null,
      status: updated.is_declared ? 'declared' : 'scheduled',
      startDate: updated.start_date,
      updatedAt: new Date().toISOString()
    };
    return ok({ data: response, message: 'Exam updated successfully' });
  } catch (e) {
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}

// DELETE /api/admin/exams/[examId]
export async function DELETE(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();
  const { examId } = params || {};
  if (!examId) return err('EXAM_NOT_FOUND', 'Exam not found', 404);

  try {
    const { data: existing } = await supabase
      .from('exam')
      .select('exam_id, is_declared')
      .eq('exam_id', examId)
      .maybeSingle();
    if (!existing) return err('EXAM_NOT_FOUND', 'Exam not found', 404);
    if (existing.is_declared) return err('EXAM_HAS_RESULTS', 'Cannot delete exam with existing student results', 409);

    // If any summaries exist, block deletion
    const { data: sumCheck } = await supabase
      .from('exam_summary')
      .select('exam_id', { head: true, count: 'exact' })
      .eq('exam_id', examId);
    if (sumCheck?.count > 0) return err('EXAM_HAS_RESULTS', 'Cannot delete exam with existing student results', 409);

    const { error: delErr } = await supabase.from('exam').delete().eq('exam_id', examId);
    if (delErr) return err('INTERNAL_ERROR', 'Failed to delete exam', 500);

    return ok({ data: { examId, deletedAt: new Date().toISOString() }, message: 'Exam deleted successfully' });
  } catch (e) {
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}


