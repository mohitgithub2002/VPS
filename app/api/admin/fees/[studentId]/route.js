import { supabase } from "@/utils/supabaseClient";
import { authenticateAdmin, unauthorized } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/student-fees/[studentId]
 * Returns detailed fee info for a single student including summary, installments & transactions.
 */
export async function GET(_req, { params }) {
  const auth = await authenticateAdmin(_req);
  if (!auth.authenticated) {
    return unauthorized();
  }

  const { studentId } = params;
  if (!studentId) {
    return NextResponse.json(
      { success: false, error: { message: "studentId is required" } },
      { status: 400 }
    );
  }

  try {
    /* STEP 1: Find enrollment record for the student */
    const { data: enrollment, error: enrollErr } = await supabase
      .from("student_enrollment")
      .select(
        `enrollment_id, roll_no,
          classrooms!inner(class,section,medium),
          students!inner(student_id,name)`
      )
      .eq("student_id", studentId)
      .single();

    if (enrollErr) {
      if (enrollErr.code === "PGRST116") {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Student not found" } },
          { status: 404 }
        );
      }
      console.error("Error fetching enrollment", enrollErr);
      return NextResponse.json(
        { success: false, error: { message: enrollErr.message } },
        { status: 500 }
      );
    }

    const enrollmentId = enrollment.enrollment_id;

    /* STEP 2: Retrieve all fee schedules for this enrollment */
    const { data: scheduleRows, error: scheduleErr } = await supabase
      .from("fee_schedule")
      .select("schedule_id,total_amount,discount,net_due,category_id")
      .eq("enrollment_id", enrollmentId);

    if (scheduleErr) {
      console.error("Error fetching fee schedules", scheduleErr);
      return NextResponse.json(
        { success: false, error: { message: scheduleErr.message } },
        { status: 500 }
      );
    }

    /* totalFees calculation */
    let totalFees = 0;
    scheduleRows.forEach((r) => {
      const component = r.net_due ?? Number(r.total_amount) - Number(r.discount || 0);
      totalFees += Number(component);
    });

    /* STEP 3: Fetch installments and allocations to compute paid */
    // Fetch installments for schedule ids
    const scheduleIds = scheduleRows.map((r) => r.schedule_id);

    const { data: installmentsData, error: installErr } = await supabase
      .from("fee_installment")
      .select(
        `installment_id, installment_no, amount_due, due_date, schedule_id`
      )
      .in("schedule_id", scheduleIds)
      .order("installment_no");

    if (installErr) {
      console.error("Error fetching installments", installErr);
    }

    const installmentIds = (installmentsData || []).map((i) => i.installment_id);

    const installmentPaidMap = {};
    let paidAmount = 0;
    if (installmentIds.length) {
      const { data: allocationsData, error: allocErr } = await supabase
        .from("fee_allocation")
        .select("amount_allocated, installment_id")
        .in("installment_id", installmentIds);

      if (allocErr) {
        console.error("Error fetching allocations", allocErr);
      } else {
        allocationsData.forEach((a) => {
          paidAmount += Number(a.amount_allocated);
          const instId = a.installment_id;
          if (instId) {
            installmentPaidMap[instId] = (installmentPaidMap[instId] || 0) + Number(a.amount_allocated);
          }
        });
      }
    }

    const pendingAmount = Math.max(totalFees - paidAmount, 0);
    let status;
    if (pendingAmount === 0) status = "Paid";
    else if (paidAmount === 0) status = "Overdue";
    else status = "Partial";

    // Fetch transactions for enrollment (optional for output)
    const { data: txData } = await supabase
      .from("fee_transaction")
      .select("transaction_id, amount, payment_date, method, ref_no")
      .eq("enrollment_id", enrollmentId)
      .order("payment_date", { ascending: false });

    // Build student summary
    const classroom = enrollment.classrooms || {};
    const student = enrollment.students || {};

    const studentSummary = {
      id: student.student_id,
      studentName: student.name,
      class: classroom.class,
      section: classroom.section,
      medium: classroom.medium,
      rollNumber: enrollment.roll_no,
      totalFees,
      paidAmount,
      pendingAmount,
      status,
      lastPaymentDate: txData?.[0]?.payment_date || null,
    };

    /* Prepare installments with status */
    // Map category id to name
    let categoriesMap = {};
    if (scheduleRows.length) {
      const uniqueCategoryIds = [...new Set(scheduleRows.map((s) => s.category_id))].filter(Boolean);
      if (uniqueCategoryIds.length) {
        const { data: catData } = await supabase
          .from("fee_category")
          .select("category_id,name")
          .in("category_id", uniqueCategoryIds);
        categoriesMap = Object.fromEntries((catData || []).map((c) => [c.category_id, c.name]));
      }
    }

    const installments = (installmentsData || []).map((inst) => {
      const schedule = scheduleRows.find((s) => s.schedule_id === inst.schedule_id) || {};
      const paid = installmentPaidMap[inst.installment_id] || 0;
      const pending = Math.max(Number(inst.amount_due) - paid, 0);
      return {
        id: inst.installment_id,
        type: categoriesMap[schedule.category_id] || "Unknown",
        installmentNo: inst.installment_no,
        amount: Number(inst.amount_due),
        paid,
        pending,
        dueDate: inst.due_date,
        status: paid === Number(inst.amount_due) ? "Paid" : "Pending",
      };
    });

    const transactions = (txData || []).map((t) => ({
      id: t.transaction_id,
      date: t.payment_date,
      amount: Number(t.amount),
      mode: t.method,
      reference: t.ref_no,
      status: "Completed",
    }));

    // Build feeSchedule information requested
    const feeSchedule = scheduleRows.map((row) => ({
      id: row.schedule_id,
      type: categoriesMap[row.category_id] || "Unknown",
      totalAmount: Number(row.total_amount),
      discount: Number(row.discount || 0),
      netDue: Number(row.net_due ?? (row.total_amount - (row.discount || 0))),
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          student: studentSummary,
          feeSchedule,
          installments,
          transactions,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Unexpected error in student fee detail endpoint", err);
    return NextResponse.json(
      { success: false, error: { message: "Internal Server Error" } },
      { status: 500 }
    );
  }
} 