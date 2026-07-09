import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withDb } from "@/db/with-db";
import { apiErrorResponse } from "@/lib/api/http";
import { getTaskForUser, updateTaskForUser } from "@/lib/api/task-service";
import { requireIntegrationAuth } from "@/lib/integrations/auth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeBlockSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true })
});

const updateTaskSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
    dayPriority: z.number().int().min(1).optional(),
    status: z.enum(["open", "done", "cancelled"]).optional(),
    size: z.enum(["small", "medium", "big"]).optional(),
    streamId: z.uuid().nullable().optional(),
    projectId: z.uuid().nullable().optional(),
    timeBlock: timeBlockSchema.nullable().optional()
  })
  .strict();

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireIntegrationAuth(request, ["tasks:read"]);
    const { taskId } = await context.params;
    const task = await withDb((db) => getTaskForUser(db, auth.user.id, taskId));

    return NextResponse.json({ task });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireIntegrationAuth(request, ["tasks:write"]);
    const { taskId } = await context.params;
    const input = updateTaskSchema.parse(await request.json());
    const task = await withDb((db) =>
      updateTaskForUser(db, auth.user.id, taskId, input)
    );

    return NextResponse.json({ task });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
