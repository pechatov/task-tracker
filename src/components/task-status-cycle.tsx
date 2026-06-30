"use client";

import { Check, Minus, Square } from "lucide-react";
import { useState } from "react";
import type { TaskStatus } from "@/lib/tasks/status";
import { taskStatusLabels } from "@/lib/tasks/status";

const statusOrder: TaskStatus[] = ["open", "done", "cancelled"];

function getNextStatus(status: TaskStatus) {
  const index = statusOrder.indexOf(status);
  return statusOrder[(index + 1) % statusOrder.length];
}

export function TaskStatusCycle({ initialStatus }: { initialStatus: TaskStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const Icon = status === "done" ? Check : status === "cancelled" ? Minus : Square;

  return (
    <div className="field">
      <span>Состояние</span>
      <input name="status" type="hidden" value={status} />
      <button
        aria-checked={status === "cancelled" ? "mixed" : status === "done"}
        className={`status-cycle ${status}`}
        onClick={() => setStatus(getNextStatus(status))}
        role="checkbox"
        type="button"
      >
        <span className="status-box">
          <Icon size={16} />
        </span>
        <span>{taskStatusLabels[status]}</span>
      </button>
    </div>
  );
}
