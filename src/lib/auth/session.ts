import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createDb } from "@/db/client";
import { withDb } from "@/db/with-db";
import { sessions, users } from "@/db/schema";
import { getEnv } from "@/lib/env";

export const SESSION_COOKIE_NAME = "task_tracker_session";

const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type AuthSession = {
  id: string;
  user: AuthUser;
  expiresAt: Date;
};

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHmac("sha256", getEnv().AUTH_SESSION_SECRET)
    .update(token)
    .digest("hex");
}

function getSessionCookieOptions(expiresAt: Date) {
  return {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production"
  };
}

async function getSessionTokenFromCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function deleteExpiredSessions(db: ReturnType<typeof createDb>) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function createUserSession(
  db: ReturnType<typeof createDb>,
  userId: string
) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt
  });

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    token,
    getSessionCookieOptions(expiresAt)
  );
}

export async function deleteSessionToken(
  db: ReturnType<typeof createDb>,
  token: string
) {
  await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, hashSessionToken(token)));
}

export async function getCurrentSession(
  db: ReturnType<typeof createDb>
): Promise<AuthSession | null> {
  const token = await getSessionTokenFromCookie();

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const [session] = await db
    .select({
      id: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      displayName: users.displayName
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!session) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }

  return {
    id: session.id,
    expiresAt: session.expiresAt,
    user: {
      id: session.userId,
      email: session.email,
      displayName: session.displayName
    }
  };
}

export async function getCurrentUser() {
  return withDb(async (db) => {
    const session = await getCurrentSession(db);
    return session?.user ?? null;
  });
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireCurrentUserId(db: ReturnType<typeof createDb>) {
  const session = await getCurrentSession(db);

  if (!session) {
    redirect("/login");
  }

  return session.user.id;
}
