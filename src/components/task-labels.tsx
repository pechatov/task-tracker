import type { CSSProperties } from "react";
import type { TaskRow } from "@/lib/tasks/data";

export function TaskLabels({ task }: { task: TaskRow }) {
  return (
    <span className="label-row">
      {task.projectName ? (
        <span
          className="label"
          style={{ "--label-color": task.projectColor ?? "#77736a" } as CSSProperties}
        >
          {task.projectName}
        </span>
      ) : null}
      {task.streamName ? (
        <span
          className="label"
          style={{ "--label-color": task.streamColor ?? "#77736a" } as CSSProperties}
        >
          {task.streamName}
        </span>
      ) : null}
      {!task.projectName && !task.streamName ? (
        <span className="muted">Без стрима и проекта</span>
      ) : null}
    </span>
  );
}
