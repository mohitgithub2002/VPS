import { supabase } from "@/utils/supabaseClient";
import { authenticateAdmin, unauthorized } from "@/lib/auth";
import { NextResponse } from "next/server";

// POST /api/admin/fees/[studentId]/transactions
// Creates a new payment transaction for a student
export async function POST(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) {
    return unauthorized();
  }

  const { studentId } = await params;
  if (!studentId) {
    return NextResponse.json(
      { success: false, error: { message: "studentId is required" } },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const { amount, paymentMode, paymentDate, referenceNumber } = body || {};

    const toISODate = (val) => {
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
    };

    const paymentDateISO = paymentDate ? toISODate(paymentDate) : null;

    // -------- Validation --------
    const validationErrors = [];
    if (!amount || Number(amount) <= 0)
      validationErrors.push({ field: "amount", message: "Amount must be greater than 0" });
    if (!paymentMode)
      validationErrors.push({ field: "paymentMode", message: "paymentMode is required" });
    
    if (paymentDate && !paymentDateISO) {
      validationErrors.push({ field: "paymentDate", message: "Invalid date format" });
    }
    if (!referenceNumber)
      validationErrors.push({ field: "referenceNumber", message: "referenceNumber is required" });

    if (validationErrors.length) {
      return NextResponse.json(
        { success: false, message: "Validation failed", errors: validationErrors },
        { status: 422 }
      );
    }

    // -------- Resolve student's latest enrollment --------
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


    // -------- Insert the transaction --------
    const payload = {
      enrollment_id: enrollmentId,
      amount: Number(amount),
      method: paymentMode,
      ref_no: referenceNumber,
    };
    if (paymentDateISO) {
      payload.payment_date = paymentDateISO;
    }

    const { data: txRow, error: txErr } = await supabase
      .from("fee_transaction")
      .insert([payload])
      .select("transaction_id, created_at, payment_date")
      .single();

    if (txErr) {
      console.error("Transaction insert error", txErr);
      return NextResponse.json(
        { success: false, error: { message: txErr.message } },
        { status: 500 }
      );
    }

    const responseData = {
      transactionId: txRow.transaction_id,
      studentId,
      amount: Number(amount),
      paymentMode,
      paymentDate: txRow.payment_date,
      referenceNumber,
      status: "completed",
      createdAt: txRow.created_at,
    };

    return NextResponse.json(
      { success: true, message: "Transaction created successfully", data: responseData },
      { status: 201 }
    );
  } catch (err) {
    console.error("Create transaction error", err);
    return NextResponse.json(
      { success: false, error: { message: "Internal Server Error" } },
      { status: 500 }
    );
  }
} 