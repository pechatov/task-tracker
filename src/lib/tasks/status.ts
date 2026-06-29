import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "@/db/schema";

export type TaskStatus = InferSelectModel<typeof tasks>["status"];

export const taskStatusLabels: Record<TaskStatus, string> = {
  open: "Открыта",
  done: "Выполнена",
  cancelled: "Отменена"
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "open" || value === "done" || value === "cancelled";
}
