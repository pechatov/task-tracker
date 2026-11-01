"use client";

import {
  ArrowRight,
  Ban,
  CalendarCheck,
  Check,
  Inbox,
  Pencil,
  RotateCcw,
  Trash2
} from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useTransition, type ReactNode } from "react";
import {
  deleteTaskInPlace,
  moveTaskToBacklog,
  moveTaskToDay,
  setTaskStatus
} from "@/app/actions/tasks";
import {
  ContextMenu,
  shouldUseNativeContextMenu,
  useContextMenu,
  type ContextMenuEntry
} from "@/components/context-menu";
import { formatDateInput } from "@/lib/date";
import type { TaskStatus } from "@/lib/tasks/status";

export type TaskMenuTarget = {
  dueDate: string | null;
  id: string;
  status: TaskStatus;
  title: string;
};

function getTomorrowDateInput() {
  const today = formatDateInput();
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function makeTaskFormData(taskId: string, values: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("taskId", taskId);

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

// Builds context menu entries for a task and runs the chosen action. The
// caller decides how the task opens (calendar and today pages use their own
// modal routes) and may hook into completion to keep local state in sync.
export function useTaskContextMenu({
  getOpenHref,
  onChanged
}: {
  getOpenHref: (taskId: string) => Route;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = useCallback(
    (action: (formData: FormData) => Promise<void>, formData: FormData) => {
      startTransition(async () => {
        try {
          await action(formData);
        } finally {
          onChanged?.();
          router.refresh();
        }
      });
    },
    [onChanged, router]
  );

  const getTaskMenuEntries = useCallback(
    (task: TaskMenuTarget): ContextMenuEntry[] => {
      const today = formatDateInput();
      const tomorrow = getTomorrowDateInput();
      const entries: ContextMenuEntry[] = [
        {
          id: "open",
          label: "Редактировать",
          icon: Pencil,
          onSelect: () => router.push(getOpenHref(task.id))
        },
        { type: "separator", id: "status-separator" }
      ];

      if (task.status === "open") {
        entries.push(
          {
            id: "done",
            label: "Выполнена",
            icon: Check,
            onSelect: () =>
              run(setTaskStatus, makeTaskFormData(task.id, { status: "done" }))
          },
          {
            id: "cancel",
            label: "Отменить",
            icon: Ban,
            onSelect: () =>
              run(setTaskStatus, makeTaskFormData(task.id, { status: "cancelled" }))
          }
        );
      } else {
        entries.push({
          id: "reopen",
          label: "Вернуть в работу",
          icon: RotateCcw,
          onSelect: () =>
            run(setTaskStatus, makeTaskFormData(task.id, { status: "open" }))
        });

        if (task.status === "done") {
          entries.push({
            id: "cancel",
            label: "Отменить",
            icon: Ban,
            onSelect: () =>
              run(setTaskStatus, makeTaskFormData(task.id, { status: "cancelled" }))
          });
        }
      }

      entries.push({ type: "separator", id: "date-separator" });

      if (task.dueDate !== today) {
        entries.push({
          id: "today",
          label: "На сегодня",
          icon: CalendarCheck,
          onSelect: () => run(moveTaskToDay, makeTaskFormData(task.id, { dueDate: today }))
        });
      }

      if (task.dueDate !== tomorrow) {
        entries.push({
          id: "tomorrow",
          label: "На завтра",
          icon: ArrowRight,
          onSelect: () =>
            run(moveTaskToDay, makeTaskFormData(task.id, { dueDate: tomorrow }))
        });
      }

      if (task.dueDate !== null) {
        entries.push({
          id: "backlog",
          label: "В бэклог",
          icon: Inbox,
          onSelect: () => run(moveTaskToBacklog, makeTaskFormData(task.id))
        });
      }

      entries.push(
        { type: "separator", id: "delete-separator" },
        {
          id: "delete",
          label: "Удалить",
          icon: Trash2,
          danger: true,
          onSelect: () => {
            if (window.confirm(`Удалить задачу «${task.title}»?`)) {
              run(deleteTaskInPlace, makeTaskFormData(task.id));
            }
          }
        }
      );

      return entries;
    },
    [getOpenHref, router, run]
  );

  return { getTaskMenuEntries, isPending };
}

// Client wrapper that gives server-rendered task rows a context menu. It uses
// `display: contents`, so it does not affect the row layout.
export function TaskContextMenuTrigger({
  children,
  openHref,
  task
}: {
  children: ReactNode;
  openHref: Route;
  task: TaskMenuTarget;
}) {
  const { closeMenu, menu, openMenu } = useContextMenu();
  const getOpenHref = useCallback(() => openHref, [openHref]);
  const { getTaskMenuEntries } = useTaskContextMenu({ getOpenHref });

  return (
    <div
      className="context-menu-trigger"
      onContextMenu={(event) => {
        // The menu is portalled, but React still bubbles its events here.
        if (
          shouldUseNativeContextMenu(event) ||
          !event.currentTarget.contains(event.target as Node)
        ) {
          return;
        }

        event.preventDefault();
        openMenu(event, getTaskMenuEntries(task), task.title);
      }}
    >
      {children}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
