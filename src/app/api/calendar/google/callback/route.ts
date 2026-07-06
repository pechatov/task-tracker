import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  createGoogleCalendarSource,
  exchangeGoogleAuthorizationCode,
  fetchGoogleProfile
} from "@/lib/calendar/sync";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const googleOAuthStateCookie = "task_tracker_google_oauth_state";

function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, getEnv().APP_BASE_URL));
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return redirectTo("/login");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get(googleOAuthStateCookie)?.value;

  if (!code || !state || state !== cookieState) {
    return redirectTo("/settings?calendarError=google_state");
  }

  try {
    const credentials = await exchangeGoogleAuthorizationCode(code);
    const profile = await fetchGoogleProfile(credentials);
    const accountEmail = profile.email ?? user.email;
    const displayName = profile.name
      ? `Google - ${profile.name}`
      : "Google Календарь";
    const response = redirectTo("/settings?calendarStatus=connected");

    response.cookies.delete(googleOAuthStateCookie);

    await createGoogleCalendarSource({
      accountEmail,
      credentials,
      displayName,
      userId: user.id
    });

    return response;
  } catch {
    return redirectTo("/settings?calendarError=google_callback");
  }
}
