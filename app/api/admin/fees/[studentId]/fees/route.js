import { supabase } from "@/utils/supabaseClient";
import { authenticateAdmin, unauthorized } from "@/lib/auth";
import { NextResponse } from "next/server";

// POST /api/admin/fees/[studentId]/fees
// Adds a new fee structure (schedule + initial installment) for a student
export async function POST(req, { params }) {
  // 1. Authenticate admin
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) {
    return unauthorized();
  }

  const { studentId } = params || {};
  if (!studentId) {
    return NextResponse.json(
      { success: false, error: { message: "studentId is required" } },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const {
      feeType,
      totalAmount,
      discount = 0,
      dueDate,
    } = body || {};

    // -------- Validation --------
    const validationErrors = [];
    if (!feeType) validationErrors.push({ field: "feeType", message: "feeType is required" });
    if (!totalAmount || Number(totalAmount) <= 0)
      validationErrors.push({ field: "totalAmount", message: "totalAmount must be greater than 0" });
    if (discount < 0 || discount > Number(totalAmount))
      validationErrors.push({ field: "discount", message: "discount must be between 0 and totalAmount" });
    if (!dueDate) {
      validationErrors.push({ field: "dueDate", message: "dueDate is required" });
    }

    // Helper to normalize date to YYYY-MM-DD
    const toISODate = (val) => {
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
    };

    const dueDateISO = toISODate(dueDate);
    if (!dueDateISO) {
      validationErrors.push({ field: "dueDate", message: "Invalid date format" });
    }

    if (validationErrors.length) {
      return NextResponse.json(
        { success: false, message: "Validation failed", errors: validationErrors },
        { status: 422 }
      );
    }

    // -------- Resolve student enrollment --------
    const { data: enrollment, error: enrollErr } = await supabase
      .from("student_enrollment")
      .select("enrollment_id")
      .eq("student_id", studentId)
      .order("enrollment_id", { ascending: false })
      .limit(1)
      .single();

    if (enrollErr || !enrollment) {
      const status = enrollErr?.code === "PGRST116" ? 404 : 500;
      const message = enrollErr?.code === "PGRST116" ? "Student not found" : enrollErr?.message;
      return NextResponse.json({ success: false, error: { message } }, { status });
    }

    const enrollmentId = enrollment.enrollment_id;

    // -------- Resolve fee category --------

    const categoryId = feeType;

    // -------- Check duplication --------
    const { data: dup } = await supabase
      .from("fee_schedule")
      .select("schedule_id")
      .eq("enrollment_id", enrollmentId)
      .eq("category_id", categoryId)
      .maybeSingle();

    if (dup) {
      return NextResponse.json(
        { success: false, message: "Fee type already exists for student" },
        { status: 409 }
      );
    }

    // -------- Insert fee_schedule --------
    const { data: scheduleRow, error: scheduleErr } = await supabase
      .from("fee_schedule")
      .insert([
        {
          enrollment_id: enrollmentId,
          category_id: categoryId,
          total_amount: totalAmount,
          discount,
          due_date: dueDateISO,
        },
      ])
      .select("schedule_id, created_at")
      .single();

    if (scheduleErr) {
      console.error("Fee schedule insert error", scheduleErr);
      return NextResponse.json(
        { success: false, error: { message: scheduleErr.message } },
        { status: 500 }
      );
    }

    // -------- Build response --------
    const responseData = {
      feeId: scheduleRow.schedule_id,
      studentId,
      totalAmount: Number(totalAmount),
      discount: Number(discount),
      dueDate: dueDateISO,
      status: "active",
      createdAt: scheduleRow.created_at || new Date().toISOString()
    };

    return NextResponse.json(
      { success: true, message: "Fee added successfully", data: responseData },
      { status: 201 }
    );
  } catch (err) {
    console.error("Add fee error", err);
    return NextResponse.json(
      { success: false, error: { message: "Internal Server Error" } },
      { status: 500 }
    );
  }
} 