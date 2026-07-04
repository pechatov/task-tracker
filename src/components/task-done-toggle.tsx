"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition, type MouseEvent } from "react";
import { toggleTaskDone } from "@/app/actions/tasks";
import type { TaskStatus } from "@/lib/tasks/status";

type TaskDoneToggleProps = {
  className?: string;
  status: TaskStatus;
  taskId: string;
};

export function TaskDoneToggle({
  className,
  status,
  taskId
}: TaskDoneToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isDone = status === "done";

  function onToggle(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const formData = new FormData();
    formData.set("taskId", taskId);

    startTransition(async () => {
      await toggleTaskDone(formData);
      router.refresh();
    });
  }

  return (
    <button
      aria-label={isDone ? "Вернуть задачу в работу" : "Отметить задачу выполненной"}
      aria-pressed={isDone}
      className={[
        "task-done-toggle",
        isDone ? "done" : "",
        isPending ? "pending" : "",
        className ?? ""
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={isPending}
      onClick={onToggle}
      onPointerDown={(event) => event.stopPropagation()}
      title={isDone ? "Вернуть в работу" : "Выполнено"}
      type="button"
    >
      <Check size={15} />
    </button>
  );
}
