import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getMicrosoftAuthorizationUrl } from "@/lib/calendar/microsoft";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const microsoftOAuthStateCookie = "task_tracker_microsoft_oauth_state";

function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, getEnv().APP_BASE_URL));
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return redirectTo("/login");
  }

  try {
    const state = randomBytes(24).toString("base64url");
    const response = NextResponse.redirect(getMicrosoftAuthorizationUrl(state));

    response.cookies.set(microsoftOAuthStateCookie, state, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });

    return response;
  } catch {
    return redirectTo("/settings?calendarError=microsoft_not_configured");
  }
}
