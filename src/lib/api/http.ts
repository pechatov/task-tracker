import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiServiceError } from "@/lib/api/task-service";
import { IntegrationAuthError } from "@/lib/integrations/auth";

export function apiErrorResponse(error: unknown) {
  if (error instanceof IntegrationAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ApiServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid payload", issues: error.issues },
      { status: 400 }
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
