"use server";

import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { withDb } from "@/db/with-db";
import { users } from "@/db/schema";
import {
  createUserSession,
  deleteExpiredSessions
} from "@/lib/auth/session";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function rejectLogin(): never {
  redirect("/login?error=invalid");
}

export async function login(formData: FormData) {
  const email = getString(formData, "email").toLowerCase();
  const password = getString(formData, "password");

  if (!email || !password) {
    rejectLogin();
  }

  await withDb(async (db) => {
    await deleteExpiredSessions(db);

    const user = await db.query.users.findFirst({
      where: eq(users.email, email)
    });

    const isValidPassword = user
      ? await argon2.verify(user.passwordHash, password).catch(() => false)
      : false;

    if (!user || !isValidPassword) {
      rejectLogin();
    }

    await createUserSession(db, user.id);
  });

  redirect("/");
}
