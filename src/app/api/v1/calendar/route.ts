import { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/db/with-db";
import { apiErrorResponse } from "@/lib/api/http";
import { getCalendarPlanForUser } from "@/lib/api/task-service";
import { formatDateInput } from "@/lib/date";
import { requireIntegrationAuth } from "@/lib/integrations/auth";

export const dynamic = "force-dynamic";

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateInput(date);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireIntegrationAuth(request, ["calendar:read"]);
    const today = formatDateInput();
    const searchParams = request.nextUrl.searchParams;
    const from = searchParams.get("from") ?? today;
    const to = searchParams.get("to") ?? addDays(from, 14);
    const plan = await withDb((db) =>
      getCalendarPlanForUser(db, auth.user.id, { from, to })
    );

    return NextResponse.json(plan);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
