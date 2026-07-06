import { Repeat2 } from "lucide-react";
import type { TaskRow } from "@/lib/tasks/data";

export function TaskTitle({ task }: { task: TaskRow }) {
  return (
    <span className="task-title">
      {task.recurringTaskId ? (
        <span className="task-title-recurring-icon" title="Повторяющаяся задача">
          <Repeat2 size={13} />
        </span>
      ) : null}
      <span className="task-title-text">{task.title}</span>
    </span>
  );
}
