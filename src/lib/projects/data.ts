import { and, asc, eq } from "drizzle-orm";
import { withDb } from "@/db/with-db";
import { projects, streams, tasks } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth/session";

export type ContextStatus = "active" | "completed";

export type StreamRow = {
  id: string;
  name: string;
  color: string;
  status: ContextStatus;
  openTaskCount: number;
};

export type ProjectRow = {
  id: string;
  name: string;
  color: string;
  status: ContextStatus;
  streamId: string;
  streamName: string;
  streamColor: string;
  streamStatus: ContextStatus;
  openTaskCount: number;
};

export type StreamGroup = StreamRow & {
  projects: ProjectRow[];
};

export type ProjectsData = {
  streamGroups: StreamGroup[];
  activeStreams: StreamRow[];
};

export async function getProjectsData(): Promise<ProjectsData> {
  return withDb(async (db) => {
    const userId = await requireCurrentUserId(db);

    const streamRows = await db
      .select({
        id: streams.id,
        name: streams.name,
        color: streams.color,
        status: streams.status
      })
      .from(streams)
      .where(eq(streams.userId, userId))
      .orderBy(asc(streams.status), asc(streams.name));

    const projectRows = await db
      .select({
        id: projects.id,
        name: projects.name,
        color: projects.color,
        status: projects.status,
        streamId: streams.id,
        streamName: streams.name,
        streamColor: streams.color,
        streamStatus: streams.status
      })
      .from(projects)
      .innerJoin(streams, eq(projects.streamId, streams.id))
      .where(eq(projects.userId, userId))
      .orderBy(asc(projects.status), asc(projects.name));

    const openTaskContexts = await db
      .select({
        streamId: tasks.streamId,
        projectId: tasks.projectId
      })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, "open")));

    const streamTaskCounts = new Map<string, number>();
    const projectTaskCounts = new Map<string, number>();

    for (const task of openTaskContexts) {
      if (task.streamId) {
        streamTaskCounts.set(
          task.streamId,
          (streamTaskCounts.get(task.streamId) ?? 0) + 1
        );
      }

      if (task.projectId) {
        projectTaskCounts.set(
          task.projectId,
          (projectTaskCounts.get(task.projectId) ?? 0) + 1
        );
      }
    }

    const streamGroups: StreamGroup[] = streamRows.map((stream) => ({
      ...stream,
      openTaskCount: streamTaskCounts.get(stream.id) ?? 0,
      projects: projectRows
        .filter((project) => project.streamId === stream.id)
        .map((project) => ({
          ...project,
          openTaskCount: projectTaskCounts.get(project.id) ?? 0
        }))
    }));

    return {
      streamGroups,
      activeStreams: streamGroups.filter((stream) => stream.status === "active")
    };
  });
}
