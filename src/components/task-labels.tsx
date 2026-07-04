import type { CSSProperties } from "react";
import type { TaskRow } from "@/lib/tasks/data";

export function TaskLabels({ task }: { task: TaskRow }) {
  if (!task.projectName) {
    return null;
  }

  return (
    <span className="label-row">
      <span
        className="label"
        style={{ "--label-color": task.projectColor ?? "#77736a" } as CSSProperties}
      >
        {task.projectName}
      </span>
    </span>
  );
}
