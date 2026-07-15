// Domain constants for the dashboard task manager (migration 0022). Server-
// and client-safe: no Supabase imports, mirrors lib/projects.ts.

import type { TaskPriority, TaskStatus, TaskWithClient } from "@/lib/types/database";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const TASK_PRIORITIES: TaskPriority[] = ["high", "medium", "low"];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Local calendar date as YYYY-MM-DD, comparable to the `due_date` column. */
export function todayISODate(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function isOverdue(task: TaskWithClient, today = todayISODate()): boolean {
  return task.status !== "done" && !!task.due_date && task.due_date < today;
}

export function isDueToday(task: TaskWithClient, today = todayISODate()): boolean {
  return task.status !== "done" && task.due_date === today;
}

/**
 * Open tasks: overdue first, then by due date (undated last), then priority,
 * then newest. Done tasks: most recently completed first.
 */
export function sortTasks(tasks: TaskWithClient[]): TaskWithClient[] {
  const today = todayISODate();
  return [...tasks].sort((a, b) => {
    if ((a.status === "done") !== (b.status === "done")) {
      return a.status === "done" ? 1 : -1;
    }
    if (a.status === "done") {
      return (b.completed_at ?? "").localeCompare(a.completed_at ?? "");
    }
    const aOver = isOverdue(a, today);
    const bOver = isOverdue(b, today);
    if (aOver !== bOver) return aOver ? -1 : 1;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    return b.created_at.localeCompare(a.created_at);
  });
}
