import { and, asc, eq, inArray } from "drizzle-orm";
import { withDb } from "@/db/with-db";
import { projects, streams, tasks } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth/session";
import type { ProjectOption, TaskRow } from "@/lib/tasks/data";

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

export type ProjectDetails = ProjectRow & {
  doneTasks: TaskRow[];
  openTasks: TaskRow[];
};

export type ProjectsData = {
  activeProjects: ProjectOption[];
  activeStreams: StreamRow[];
  selectedProject: ProjectDetails | null;
  selectedTask: TaskRow | null;
  streamGroups: StreamGroup[];
};

function isUuid(value: string | undefined) {
  return (
    value !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export async function getProjectsData(
  selectedProjectId?: string,
  selectedTaskId?: string
): Promise<ProjectsData> {
  return withDb(async (db) => {
    const userId = await requireCurrentUserId(db);
    const normalizedSelectedProjectId = isUuid(selectedProjectId)
      ? selectedProjectId
      : undefined;
    const normalizedSelectedTaskId = isUuid(selectedTaskId)
      ? selectedTaskId
      : undefined;
    const taskSelect = {
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      dueDate: tasks.dueDate,
      dayPriority: tasks.dayPriority,
      status: tasks.status,
      size: tasks.size,
      streamId: tasks.streamId,
      streamName: streams.name,
      streamColor: streams.color,
      projectId: tasks.projectId,
      projectName: projects.name,
      projectColor: projects.color,
      recurringTaskId: tasks.recurringTaskId,
      timeBlockStart: tasks.timeBlockStart,
      timeBlockEnd: tasks.timeBlockEnd
    };

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

    const activeProjects: ProjectOption[] = projectRows
      .filter(
        (project) =>
          project.status === "active" && project.streamStatus === "active"
      )
      .map((project) => ({
        id: project.id,
        name: project.name,
        color: project.color,
        streamId: project.streamId,
        streamName: project.streamName
      }));

    const openTaskContexts = await db
      .select({
        streamId: tasks.streamId,
        projectId: tasks.projectId
      })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, "open")));

    const selectedProjectTasks = normalizedSelectedProjectId
      ? await db
          .select(taskSelect)
          .from(tasks)
          .leftJoin(streams, eq(tasks.streamId, streams.id))
          .leftJoin(projects, eq(tasks.projectId, projects.id))
          .where(
            and(
              eq(tasks.userId, userId),
              eq(tasks.projectId, normalizedSelectedProjectId),
              inArray(tasks.status, ["open", "done"])
            )
          )
          .orderBy(
            asc(tasks.status),
            asc(tasks.dueDate),
            asc(tasks.dayPriority),
            asc(tasks.createdAt)
          )
      : [];
    const selectedTask = normalizedSelectedTaskId
      ? await db
          .select(taskSelect)
          .from(tasks)
          .leftJoin(streams, eq(tasks.streamId, streams.id))
          .leftJoin(projects, eq(tasks.projectId, projects.id))
          .where(
            and(eq(tasks.userId, userId), eq(tasks.id, normalizedSelectedTaskId))
          )
          .limit(1)
      : [];

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
    const selectedProjectBase = normalizedSelectedProjectId
      ? streamGroups
          .flatMap((stream) => stream.projects)
          .find((project) => project.id === normalizedSelectedProjectId)
      : null;
    const selectedProject: ProjectDetails | null = selectedProjectBase
      ? {
          ...selectedProjectBase,
          doneTasks: selectedProjectTasks.filter((task) => task.status === "done"),
          openTasks: selectedProjectTasks.filter((task) => task.status === "open")
        }
      : null;

    return {
      activeProjects,
      activeStreams: streamGroups.filter((stream) => stream.status === "active"),
      selectedProject,
      selectedTask: selectedTask[0] ?? null,
      streamGroups
    };
  });
}
