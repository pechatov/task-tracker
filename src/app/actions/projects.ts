"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { withDb } from "@/db/with-db";
import { projects, streams } from "@/db/schema";
import {
  requireCurrentUserId
} from "@/lib/auth/session";
import { getNextContextColor } from "@/lib/context/colors";
import type { ContextStatus } from "@/lib/projects/data";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function getContextStatus(formData: FormData): ContextStatus {
  return getString(formData, "status") === "completed" ? "completed" : "active";
}

function getColor(formData: FormData) {
  const color = getString(formData, "color");

  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#77736a";
}

function revalidateProjectViews() {
  revalidatePath("/projects");
  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function createStream(formData: FormData) {
  const name = getString(formData, "name");

  if (!name) {
    throw new Error("Stream name is required");
  }

  await withDb(async (db) => {
    const userId = await requireCurrentUserId(db);
    const streamColors = await db
      .select({ color: streams.color })
      .from(streams)
      .where(eq(streams.userId, userId));
    const color = getNextContextColor(streamColors.map((stream) => stream.color));

    await db
      .insert(streams)
      .values({
        userId,
        name,
        color,
        status: "active"
      })
      .onConflictDoUpdate({
        target: [streams.userId, streams.name],
        set: {
          status: "active",
          updatedAt: new Date()
        }
      });
  });

  revalidateProjectViews();
}

export async function updateStreamStatus(formData: FormData) {
  const streamId = getString(formData, "streamId");
  const status = getContextStatus(formData);

  if (!streamId) {
    throw new Error("Stream id is required");
  }

  await withDb(async (db) => {
    const userId = await requireCurrentUserId(db);

    await db
      .update(streams)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(streams.id, streamId), eq(streams.userId, userId)));
  });

  revalidateProjectViews();
}

export async function updateStream(formData: FormData) {
  const streamId = getString(formData, "streamId");
  const name = getString(formData, "name");
  const color = getColor(formData);
  const status = getContextStatus(formData);

  if (!streamId || !name) {
    throw new Error("Stream id and name are required");
  }

  await withDb(async (db) => {
    const userId = await requireCurrentUserId(db);

    await db
      .update(streams)
      .set({ name, color, status, updatedAt: new Date() })
      .where(and(eq(streams.id, streamId), eq(streams.userId, userId)));
  });

  revalidateProjectViews();
  redirect("/projects");
}

export async function createProject(formData: FormData) {
  const name = getString(formData, "name");
  const streamId = getString(formData, "streamId");

  if (!name || !streamId) {
    throw new Error("Project name and stream are required");
  }

  await withDb(async (db) => {
    const userId = await requireCurrentUserId(db);
    const stream = await db.query.streams.findFirst({
      where: and(
        eq(streams.id, streamId),
        eq(streams.userId, userId),
        eq(streams.status, "active")
      )
    });

    if (!stream) {
      throw new Error("Project requires an active stream");
    }

    const projectColors = await db
      .select({ color: projects.color })
      .from(projects)
      .where(eq(projects.userId, userId));
    const color = getNextContextColor(
      projectColors.map((project) => project.color)
    );

    await db
      .insert(projects)
      .values({
        userId,
        streamId,
        name,
        color,
        status: "active"
      })
      .onConflictDoUpdate({
        target: [projects.userId, projects.streamId, projects.name],
        set: {
          status: "active",
          updatedAt: new Date()
        }
      });
  });

  revalidateProjectViews();
}

export async function updateProjectStatus(formData: FormData) {
  const projectId = getString(formData, "projectId");
  const status = getContextStatus(formData);

  if (!projectId) {
    throw new Error("Project id is required");
  }

  await withDb(async (db) => {
    const userId = await requireCurrentUserId(db);

    await db
      .update(projects)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  });

  revalidateProjectViews();
}

export async function updateProject(formData: FormData) {
  const projectId = getString(formData, "projectId");
  const name = getString(formData, "name");
  const color = getColor(formData);
  const status = getContextStatus(formData);

  if (!projectId || !name) {
    throw new Error("Project id and name are required");
  }

  await withDb(async (db) => {
    const userId = await requireCurrentUserId(db);

    await db
      .update(projects)
      .set({ name, color, status, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  });

  revalidateProjectViews();
  redirect("/projects");
}
