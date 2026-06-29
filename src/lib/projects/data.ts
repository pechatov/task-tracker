import { asc, eq } from "drizzle-orm";
import { withDb } from "@/db/with-db";
import { projects, streams } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth/session";

export type ContextStatus = "active" | "completed";

export type StreamRow = {
  id: string;
  name: string;
  color: string;
  status: ContextStatus;
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
};

export type ProjectsData = {
  streams: StreamRow[];
  activeStreams: StreamRow[];
  projects: ProjectRow[];
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
      .orderBy(asc(streams.name), asc(projects.status), asc(projects.name));

    return {
      streams: streamRows,
      activeStreams: streamRows.filter((stream) => stream.status === "active"),
      projects: projectRows
    };
  });
}
