import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getGoogleAuthorizationUrl } from "@/lib/calendar/sync";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const googleOAuthStateCookie = "task_tracker_google_oauth_state";

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
    const response = NextResponse.redirect(getGoogleAuthorizationUrl(state));

    response.cookies.set(googleOAuthStateCookie, state, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });

    return response;
  } catch {
    return redirectTo("/settings?calendarError=google_not_configured");
  }
}
