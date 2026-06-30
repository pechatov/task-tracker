import type { InferSelectModel } from "drizzle-orm";
import type { tasks } from "@/db/schema";

export type TaskSize = InferSelectModel<typeof tasks>["size"];

export const taskSizeLabels: Record<TaskSize, string> = {
  small: "Small",
  medium: "Medium",
  big: "Big"
};

export const taskSizeDurationsMinutes: Record<TaskSize, number> = {
  small: 60,
  medium: 90,
  big: 180
};

export function isTaskSize(value: unknown): value is TaskSize {
  return value === "small" || value === "medium" || value === "big";
}

export function getTaskSizeDurationMinutes(size: TaskSize) {
  return taskSizeDurationsMinutes[size];
}
