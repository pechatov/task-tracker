import { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/db/with-db";
import { apiErrorResponse } from "@/lib/api/http";
import { listContextsForUser } from "@/lib/api/task-service";
import { requireIntegrationAuth } from "@/lib/integrations/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireIntegrationAuth(request, ["contexts:read"]);
    const contexts = await withDb((db) =>
      listContextsForUser(db, auth.user.id)
    );

    return NextResponse.json(contexts);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
