import { supabase } from "@/utils/supabaseClient";
import { authenticateAdmin, unauthorized } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/fees/filter-options
 * Returns distinct classes, payment modes, fee types, and gateways.
 */
export async function GET(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    // Fetch classrooms
    const { data: classData } = await supabase
      .from("classrooms")
      .select("classroom_id, class, section, medium")
      .order("class");

    // Fetch distinct payment methods
    const { data: methodData } = await supabase
      .from("fee_transaction")
      .select("method")
      .neq("method", null)
      .neq("method", "")
      .order("method");

    const paymentModes = [...new Set((methodData || []).map((m) => m.method))];

    // Fetch fee types (category names)
    const { data: feeTypesData } = await supabase.from("fee_category").select("*").order("category_id");
    const feeTypes = feeTypesData;

    // For paymentGateways we currently do not have a dedicated column, reuse paymentModes
    const paymentGateways = paymentModes;

    const classes = (classData || []).map((c) => ({
      id: c.classroom_id,
      name: c.class,
      section: c.section,
      medium: c.medium,
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          classes,
          paymentModes,
          feeTypes,
          paymentGateways,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error fetching filter options", err);
    return NextResponse.json(
      { success: false, error: { message: "Internal Server Error" } },
      { status: 500 }
    );
  }
} 