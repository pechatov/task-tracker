import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withDb } from "@/db/with-db";
import {
  deleteSessionToken,
  SESSION_COOKIE_NAME
} from "@/lib/auth/session";

function redirectToLogin(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303
  });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await withDb((db) => deleteSessionToken(db, token));
  }

  const response = redirectToLogin(request);
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}

export async function GET(request: NextRequest) {
  return redirectToLogin(request);
}
