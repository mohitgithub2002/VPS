import { supabase } from "@/utils/supabaseClient";
import { authenticateAdmin, unauthorized } from "@/lib/auth";
import { NextResponse } from "next/server";

// PUT /api/admin/fees/[studentId]/fees/[feeId]
// Updates an existing fee schedule for a student
export async function PUT(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) {
    return unauthorized();
  }

  const { studentId, feeId } = await params;
  if (!studentId || !feeId) {
    return NextResponse.json(
      { success: false, error: { message: "studentId and feeId are required" } },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const updates = {};
    const validationErrors = [];

    if (body.totalAmount !== undefined) {
      if (Number(body.totalAmount) <= 0) {
        validationErrors.push({ field: "totalAmount", message: "totalAmount must be greater than 0" });
      } else {
        updates.total_amount = Number(body.totalAmount);
      }
    }

    if (body.discount !== undefined) {
      if (Number(body.discount) < 0) {
        validationErrors.push({ field: "discount", message: "discount cannot be negative" });
      } else {
        updates.discount = Number(body.discount);
      }
    }

    // Date normalization helper
    const toISODate = (val) => {
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
    };

    let dueDateISO;
    if (body.dueDate !== undefined) {
      dueDateISO = toISODate(body.dueDate);
      if (!dueDateISO) {
        validationErrors.push({ field: "dueDate", message: "Invalid date format" });
      }
    }

    if (validationErrors.length) {
      return NextResponse.json(
        { success: false, message: "Validation failed", errors: validationErrors },
        { status: 422 }
      );
    }
    

    // Update the fee_schedule row
    const { data: updated, error: updErr } = await supabase
      .from("fee_schedule")
      .update(updates)
      .eq("schedule_id", feeId)
      .select("schedule_id, total_amount, discount, net_due")
      .single();

    if (updErr) {
      console.error("Fee update error", updErr);
      return NextResponse.json(
        { success: false, error: { message: updErr.message } },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Fee updated successfully",
        data: {
          feeId: updated.schedule_id,
          studentId,
          totalAmount: Number(updated.total_amount),
          discount: Number(updated.discount || 0),
          netDue: Number(updated.net_due),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Update fee error", err);
    return NextResponse.json(
      { success: false, error: { message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/fees/[studentId]/fees/[feeId]
// Deletes a fee schedule if it has no associated transactions/allocations
export async function DELETE(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) {
    return unauthorized();
  }

  const { studentId, feeId } = await params;
  if (!studentId || !feeId) {
    return NextResponse.json(
      { success: false, error: { message: "studentId and feeId are required" } },
      { status: 400 }
    );
  }

  try {
    // Gather all installments for this schedule
    const { data: installments, error: instErr } = await supabase
      .from("fee_installment")
      .select("installment_id")
      .eq("schedule_id", feeId);

    if (instErr) {
      console.error("Installment fetch error", instErr);
      return NextResponse.json(
        { success: false, error: { message: instErr.message } },
        { status: 500 }
      );
    }

    const installmentIds = (installments || []).map((i) => i.installment_id);
    if (installmentIds.length) {
      const { data: allocations } = await supabase
        .from("fee_allocation")
        .select("allocation_id")
        .in("installment_id", installmentIds)
        .limit(1);

      if (allocations && allocations.length) {
        return NextResponse.json(
          {
            success: false,
            message: "Cannot delete fee with existing transactions",
            error: {
              code: "FEE_HAS_TRANSACTIONS",
              details: "This fee has associated allocations/transactions. Delete them first.",
            },
          },
          { status: 409 }
        );
      }
    }

    // Delete the schedule
    const { error: delErr } = await supabase.from("fee_schedule").delete().eq("schedule_id", feeId);

    if (delErr) {
      console.error("Fee deletion error", delErr);
      return NextResponse.json(
        { success: false, error: { message: delErr.message } },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Fee deleted successfully",
        data: {
          feeId: parseInt(feeId, 10),
          studentId,
          deletedAt: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Delete fee error", err);
    return NextResponse.json(
      { success: false, error: { message: "Internal Server Error" } },
      { status: 500 }
    );
  }
} 