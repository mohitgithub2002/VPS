import { supabase } from "@/utils/supabaseClient";
import { authenticateAdmin, unauthorized } from "@/lib/auth";
import { NextResponse } from "next/server";

// DELETE /api/admin/fees/[studentId]/transactions/[transactionId]
// Removes a transaction record if it belongs to the student
export async function DELETE(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) {
    return unauthorized();
  }

  const { studentId, transactionId } = await params;
  if (!studentId || !transactionId) {
    return NextResponse.json(
      { success: false, error: { message: "studentId and transactionId are required" } },
      { status: 400 }
    );
  }

  try {
    // Verify that the transaction exists and belongs to the student's enrollment
    const { data: txRow, error: txErr } = await supabase
      .from("fee_transaction")
      .select("transaction_id, enrollment_id")
      .eq("transaction_id", transactionId)
      .single();

    if (txErr) {
      const status = txErr.code === "PGRST116" ? 404 : 500;
      const message = txErr.code === "PGRST116" ? "Transaction not found" : txErr.message;
      return NextResponse.json({ success: false, error: { message } }, { status });
    }

    // Check enrollment belongs to student
    const { data: enrollment, error: enrollErr } = await supabase
      .from("student_enrollment")
      .select("enrollment_id")
      .eq("enrollment_id", txRow.enrollment_id)
      .eq("student_id", studentId)
      .single();

    if (enrollErr || !enrollment) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Student or transaction not found" } },
        { status: 404 }
      );
    }

    // At present all transactions are treated as completed; In production we might prevent deleting completed transactions.
    // Proceed with deletion
    const { error: delErr } = await supabase
      .from("fee_transaction")
      .delete()
      .eq("transaction_id", transactionId);

    if (delErr) {
      console.error("Delete transaction error", delErr);
      return NextResponse.json(
        { success: false, error: { message: delErr.message } },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Transaction deleted successfully",
        data: {
          transactionId,
          studentId,
          deletedAt: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Unexpected error deleting transaction", err);
    return NextResponse.json(
      { success: false, error: { message: "Internal Server Error" } },
      { status: 500 }
    );
  }
} 