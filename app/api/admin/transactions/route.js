import { supabase } from "@/utils/supabaseClient";
import { authenticateAdmin, unauthorized } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/transactions
 * Retrieves transaction records with filtering, search, and pagination.
 *
 * Query Parameters:
 * - search       : string  – search by transaction id, reference no or student name
 * - classroomId  : integer – filter by classroom id
 * - paymentMode  : string  – filter by payment method
 * - feeType      : string  – filter by fee category name
 * - dateFrom     : string  – ISO date (YYYY-MM-DD) – start date filter (inclusive)
 * - dateTo       : string  – ISO date (YYYY-MM-DD) – end date filter (inclusive)
 * - page         : integer – page number (default 1)
 * - limit        : integer – items per page (default 10)
 */
export async function GET(req) {
  // Admin authentication
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    const { searchParams } = new URL(req.url);
    // Pagination params
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 100); // safety
    const offset = (page - 1) * limit;

    // Filters
    const search = searchParams.get("search")?.trim();
    const classroomId = searchParams.get("classroomId");
    const paymentMode = searchParams.get("paymentMode");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    // --- Base query: fee_transaction + fee_category only (no fee_summary join) ---
    let query = supabase
      .from("fee_transaction")
      .select(
        `
          transaction_id,
          enrollment_id,
          amount,
          method,
          ref_no,
          payment_date,
          created_at
        `,
        { count: "exact" }
      )
      .order("payment_date", { ascending: false })
      .range(offset, offset + limit - 1);

    // Dynamic filters applied directly where possible
    if (paymentMode) {
      query = query.eq("method", paymentMode);
    }

    if (dateFrom) {
      query = query.gte("payment_date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("payment_date", dateTo);
    }

    // Execute query
    const { data, error, count } = await query;
    if (error) {
      console.error("Error fetching transactions", error);
      return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
    }

    // --- Fetch enrollment details for all transactions ---
    const enrollmentIds = (data || []).map((t) => t.enrollment_id);
    let enrollmentMap = {};
    if (enrollmentIds.length) {
      const { data: enrollRows, error: enrollErr } = await supabase
        .from("student_enrollment")
        .select(
          `enrollment_id, roll_no,
           classrooms:classrooms!inner(classroom_id,class,section,medium),
           students:students!inner(student_id,name)`
        )
        .in("enrollment_id", enrollmentIds);

      if (enrollErr) {
        console.error("Error fetching enrollments for transactions", enrollErr);
      }

      (enrollRows || []).forEach((row) => {
        enrollmentMap[row.enrollment_id] = row;
      });
    }

    // Client-side filtering using fetched enrollment data
    let filtered = (data || []).filter((tx) => {
      const enr = enrollmentMap[tx.enrollment_id] || {};
      const student = enr.students || {};
      const classroom = enr.classrooms || {};

      // paymentMode/date filters already applied server-side, but we need classroom & search here
      if (classroomId && classroom.classroom_id?.toString() !== classroomId) {
        return false;
      }

      if (search) {
        const lowered = search.toLowerCase();
        const matches =
          tx.transaction_id.toString().toLowerCase().includes(lowered) ||
          (tx.ref_no || "").toLowerCase().includes(lowered) ||
          (student.name || "").toLowerCase().includes(lowered);
        if (!matches) return false;
      }

      return true;
    });

    // Transform response to match spec where fields are available in DB
    const transactions = filtered.map((tx) => {
      const enrollment = enrollmentMap[tx.enrollment_id] || {};
      const classroom = enrollment.classrooms || {};
      const student = enrollment.students || {};

      return {
        id: tx.transaction_id, // internal id
        transactionId: "TXN" + tx.transaction_id, // same – external id not stored separately
        studentId: student.student_id,
        studentName: student.name,
        class: classroom.class,
        section: classroom.section,
        rollNumber: enrollment.roll_no,
        amount: Number(tx.amount),
        paymentDate: tx.payment_date,
        paymentMode: tx.method,
        receiptNo: tx.ref_no,
        reference: tx.ref_no,
      };
    });

    // Summary – totals computed on already-filtered set
    const totalAmount = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);

    const total = count ?? transactions.length;
    const totalPages = limit ? Math.ceil(total / limit) : 0;

    return NextResponse.json(
      {
        success: true,
        data: {
          transactions,
          summary: {
            totalTransactions: total,
            totalAmount,
          },
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
    console.error("Unexpected error in transactions endpoint", err);
    return NextResponse.json(
      { success: false, error: { message: "Internal Server Error" } },
      { status: 500 }
    );
  }
} 