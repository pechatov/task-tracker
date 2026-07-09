import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withDb } from "@/db/with-db";
import { apiErrorResponse } from "@/lib/api/http";
import {
  ApiServiceError,
  createTaskForUser,
  listTasksForUser,
  type ListTasksInput
} from "@/lib/api/task-service";
import { requireIntegrationAuth } from "@/lib/integrations/auth";

export const dynamic = "force-dynamic";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeBlockSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true })
});

const createTaskSchema = z
  .object({
    title: z.string().min(1),
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

function getStatusFilter(value: string | null): ListTasksInput["status"] {
  if (!value || value === "all") {
    return "all";
  }

  if (value === "open" || value === "done" || value === "cancelled") {
    return value;
  }

  throw new ApiServiceError("Invalid status filter");
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireIntegrationAuth(request, ["tasks:read"]);
    const searchParams = request.nextUrl.searchParams;
    const tasks = await withDb((db) =>
      listTasksForUser(db, auth.user.id, {
        from: searchParams.get("from") ?? undefined,
        to: searchParams.get("to") ?? undefined,
        status: getStatusFilter(searchParams.get("status")),
        includeBacklog: searchParams.get("includeBacklog") !== "false"
      })
    );

    return NextResponse.json({ tasks });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireIntegrationAuth(request, ["tasks:write"]);
    const input = createTaskSchema.parse(await request.json());
    const task = await withDb((db) => createTaskForUser(db, auth.user.id, input));

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
