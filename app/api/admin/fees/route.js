import { supabase } from "@/utils/supabaseClient";
import { authenticateAdmin, unauthorized } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/student-fees
 * Retrieves student fee summaries with filtering & pagination.
 *
 * Query Parameters:
 * - search       : string  – search by student name, id, roll number
 * - classroomId  : integer – filter by classroom
 * - status       : string  – paid | partial | overdue
 * - page         : integer – page number (default 1)
 * - limit        : integer – items per page (default 10)
 */
export async function GET(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

    const classroomId = searchParams.get("classroomId");
    const search = searchParams.get("search")?.trim().toLowerCase();
    const statusFilter = searchParams.get("status")?.toLowerCase();

    /* --------------------------------------------------------------------
     * 1. Fetch enrollments (+ student & class meta) that match classroom filter
     * ------------------------------------------------------------------ */
    let enrollmentQuery = supabase
      .from("student_enrollment")
      .select(
        `enrollment_id, roll_no,
         classrooms!inner(classroom_id,class,section,medium),
         students!inner(student_id,name)`
      );

    if (classroomId) {
      enrollmentQuery = enrollmentQuery.eq("classrooms.classroom_id", classroomId);
    }

    const { data: enrollments, error: enrollErr } = await enrollmentQuery;
    if (enrollErr) {
      console.error("Error fetching enrollments", enrollErr);
      return NextResponse.json(
        { success: false, error: { message: enrollErr.message } },
        { status: 500 }
      );
    }

    if (!enrollments.length) {
      // No students matched – quick exit
      return NextResponse.json({ success: true, data: { students: [], summary: {}, pagination: {} } });
    }

    const enrollmentIds = enrollments.map((e) => e.enrollment_id);

    /* --------------------------------------------------------------------
     * 2. Retrieve fee_schedule rows & aggregate totals client-side
     * ------------------------------------------------------------------ */
    const { data: feeRows, error: feeErr } = await supabase
      .from("fee_schedule")
      .select("enrollment_id, net_due")
      .in("enrollment_id", enrollmentIds);

    if (feeErr) {
      console.error("Error fetching fee schedules", feeErr);
    }

    const feeMap = {};
    (feeRows || []).forEach((row) => {
      feeMap[row.enrollment_id] = (feeMap[row.enrollment_id] || 0) + Number(row.net_due);
    });

    /* --------------------------------------------------------------------
     * 3. Retrieve fee_allocation rows & aggregate paid amounts client-side
     * ------------------------------------------------------------------ */
    const { data: allocationRows, error: allocErr } = await supabase
      .from("fee_allocation")
      .select("amount_allocated, fee_installment:fee_installment!inner(fee_schedule(enrollment_id))")
      .in("fee_installment.fee_schedule.enrollment_id", enrollmentIds);

    if (allocErr) {
      console.error("Error fetching allocations", allocErr);
    }

    const paidMap = {};
    (allocationRows || []).forEach((row) => {
      const eid = row.fee_installment?.fee_schedule?.enrollment_id;
      if (eid) {
        paidMap[eid] = (paidMap[eid] || 0) + Number(row.amount_allocated);
      }
    });

    /* --------------------------------------------------------------------
     * 4. Merge into final student objects
     * ------------------------------------------------------------------ */
    let studentsArr = enrollments.map((enr) => {
      const classroom = enr.classrooms || {};
      const student = enr.students || {};

      const totalFees = feeMap[enr.enrollment_id] || 0;
      const paidAmount = paidMap[enr.enrollment_id] || 0;
      const pendingAmount = Math.max(totalFees - paidAmount, 0);

      let status;
      if (totalFees === 0) status = "Unmarked"; // no fee schedule
      else if (pendingAmount === 0) status = "Paid";
      else if (paidAmount === 0) status = "Overdue";
      else status = "Partial";

      return {
        id: student.student_id,
        enrollmentId: enr.enrollment_id,
        studentName: student.name,
        class: classroom.class,
        section: classroom.section,
        medium: classroom.medium,
        rollNumber: enr.roll_no,
        totalFees,
        paidAmount,
        pendingAmount,
        status,
      };
    });

    /* --------------------------------------------------------------------
     * 5. Filters (search / status) on list
     * ------------------------------------------------------------------ */
    if (search) {
      studentsArr = studentsArr.filter(
        (s) =>
          s.studentName.toLowerCase().includes(search) ||
          String(s.id).includes(search) ||
          String(s.rollNumber).includes(search)
      );
    }

    if (statusFilter && ["paid", "partial", "overdue", "unmarked"].includes(statusFilter)) {
      studentsArr = studentsArr.filter((s) => s.status.toLowerCase() === statusFilter);
    }

    /* --------------------------------------------------------------------
     * 6. Sort – fee scheduled first (totalFees > 0), then by student name
     * ------------------------------------------------------------------ */
    studentsArr.sort((a, b) => {
      if (a.totalFees === 0 && b.totalFees > 0) return 1;
      if (a.totalFees > 0 && b.totalFees === 0) return -1;
      return a.studentName.localeCompare(b.studentName);
    });

    /* --------------------------------------------------------------------
     * 7. Pagination & Summary
     * ------------------------------------------------------------------ */
    const total = studentsArr.length;
    const totalPages = limit ? Math.ceil(total / limit) : 0;
    const offset = (page - 1) * limit;
    const paginated = studentsArr.slice(offset, offset + limit);

    const summary = {
      totalStudents: total,
      scheduledStudents: studentsArr.filter((s) => s.totalFees > 0).length,
      paidStudents: studentsArr.filter((s) => s.status === "Paid").length,
      partialStudents: studentsArr.filter((s) => s.status === "Partial").length,
      overdueStudents: studentsArr.filter((s) => s.status === "Overdue").length,
      unmarkedStudents: studentsArr.filter((s) => s.status === "Unmarked").length,
      totalPendingAmount: studentsArr.reduce((sum, s) => sum + s.pendingAmount, 0),
    };

    return NextResponse.json(
      {
        success: true,
        data: {
          students: paginated,
          summary,
          pagination: {
            total,
            pages: totalPages,
            page,
            limit,
            hasNext: page < totalPages,
            hasPrev: page > 1,
          },
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("student-fees endpoint error", err);
    return NextResponse.json(
      { success: false, error: { message: "Internal Server Error" } },
      { status: 500 }
    );
  }
} 