import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  exchangeMicrosoftAuthorizationCode,
  fetchMicrosoftProfile
} from "@/lib/calendar/microsoft";
import { createMicrosoftCalendarSource } from "@/lib/calendar/sync";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const microsoftOAuthStateCookie = "task_tracker_microsoft_oauth_state";

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
  const cookieState = request.cookies.get(microsoftOAuthStateCookie)?.value;

  if (!code || !state || state !== cookieState) {
    return redirectTo("/settings?calendarError=microsoft_state");
  }

  try {
    const credentials = await exchangeMicrosoftAuthorizationCode(code);
    const profile = await fetchMicrosoftProfile(credentials);
    const accountEmail = profile.mail ?? profile.userPrincipalName ?? user.email;
    const displayName = profile.displayName
      ? `Microsoft 365 - ${profile.displayName}`
      : "Microsoft 365";
    const response = redirectTo("/settings?calendarStatus=connected");

    response.cookies.delete(microsoftOAuthStateCookie);

    await createMicrosoftCalendarSource({
      accountEmail,
      credentials,
      displayName,
      userId: user.id
    });

    return response;
  } catch {
    return redirectTo("/settings?calendarError=microsoft_callback");
  }
}
