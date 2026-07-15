"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import {
  CalendarBlankIcon,
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  FlagIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
} from "@phosphor-icons/react";

import {
  createTaskAction,
  deleteTaskAction,
  setTaskStatusAction,
  updateTaskAction,
} from "@/app/actions/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  isDueToday,
  isOverdue,
  sortTasks,
} from "@/lib/tasks";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  ActionState,
} from "@/app/actions/types";
import type {
  Client,
  TaskPriority,
  TaskStatus,
  TaskWithClient,
} from "@/lib/types/database";

type ClientOption = Pick<Client, "id" | "company_name">;

const PRIORITY_TONE: Record<TaskPriority, string> = {
  high: "border-red-300/30 bg-red-400/10 text-red-300",
  medium: "border-amber-300/30 bg-amber-400/10 text-amber-300",
  low: "border-glass-border bg-glass-highlight/10 text-muted-foreground",
};

const DONE_LIMIT = 12;

function PrioritySelect({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: TaskPriority;
}) {
  return (
    <Select name={name} defaultValue={defaultValue}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TASK_PRIORITIES.map((p) => (
          <SelectItem key={p} value={p}>
            {TASK_PRIORITY_LABEL[p]} priority
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ClientSelect({
  clients,
  defaultValue,
}: {
  clients: ClientOption[];
  defaultValue: string;
}) {
  return (
    <Select name="client_id" defaultValue={defaultValue}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="No client" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No client</SelectItem>
        {clients.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.company_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function QuickAddForm({ clients }: { clients: ClientOption[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createTaskAction,
    {},
  );

  useEffect(() => {
    if (state.success) formRef.current?.reset();
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem_10rem_auto]"
    >
      <Input
        name="title"
        required
        maxLength={300}
        placeholder="Add a task — e.g. Finish Casey's bag proofs"
        aria-label="Task title"
      />
      <ClientSelect clients={clients} defaultValue="none" />
      <PrioritySelect name="priority" defaultValue="medium" />
      <Input name="due_date" type="date" aria-label="Due date" />
      <Button type="submit" disabled={pending}>
        <PlusIcon weight="bold" />
        Add
      </Button>
    </form>
  );
}

function EditTaskDialog({
  task,
  clients,
  open,
  onOpenChange,
}: {
  task: TaskWithClient;
  clients: ClientOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateTaskAction.bind(null, task.id),
    {},
  );

  useEffect(() => {
    if (state.success) onOpenChange(false);
    if (state.error) toast.error(state.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor={`title-${task.id}`}>Title</Label>
            <Input
              id={`title-${task.id}`}
              name="title"
              required
              maxLength={300}
              defaultValue={task.title}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`notes-${task.id}`}>Notes</Label>
            <Textarea
              id={`notes-${task.id}`}
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={task.notes ?? ""}
              placeholder="Details, links, sizes, anything you need on hand."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <ClientSelect
                clients={clients}
                defaultValue={task.client_id ?? "none"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <PrioritySelect name="priority" defaultValue={task.priority} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select name="status" defaultValue={task.status}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map(
                    (s) => (
                      <SelectItem key={s} value={s}>
                        {TASK_STATUS_LABEL[s]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`due-${task.id}`}>Due date</Label>
              <Input
                id={`due-${task.id}`}
                name="due_date"
                type="date"
                defaultValue={task.due_date ?? ""}
              />
            </div>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save task"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskRow({
  task,
  clients,
}: {
  task: TaskWithClient;
  clients: ClientOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const done = task.status === "done";
  const overdue = isOverdue(task);
  const dueToday = isDueToday(task);

  const toggleDone = () =>
    startTransition(async () => {
      const result = await setTaskStatusAction(
        task.id,
        done ? "todo" : "done",
      );
      if (result.error) toast.error(result.error);
    });

  const startProgress = () =>
    startTransition(async () => {
      const result = await setTaskStatusAction(task.id, "in_progress");
      if (result.error) toast.error(result.error);
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteTaskAction(task.id);
      if (result.error) toast.error(result.error);
    });

  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-xl border border-glass-border bg-glass-highlight/5 px-3.5 py-3 transition-opacity",
        (done || isPending) && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={toggleDone}
        disabled={isPending}
        aria-label={done ? "Mark as to do" : "Mark as done"}
        className="mt-0.5 shrink-0 text-metal-platinum transition-colors hover:text-emerald-300"
      >
        {done ? (
          <CheckCircleIcon weight="fill" className="size-5 text-emerald-400" />
        ) : (
          <CircleIcon className="size-5" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate", done && "line-through")}>{task.title}</p>
        {task.notes ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
            {task.notes}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          {task.client ? (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <UserIcon className="size-3.5" />
              {task.client.company_name}
            </span>
          ) : null}
          {task.due_date ? (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                overdue
                  ? "text-red-300"
                  : dueToday
                    ? "text-amber-300"
                    : "text-muted-foreground",
              )}
            >
              <CalendarBlankIcon className="size-3.5" />
              {overdue
                ? `Overdue — ${formatDate(task.due_date)}`
                : dueToday
                  ? "Due today"
                  : formatDate(task.due_date)}
            </span>
          ) : null}
          <Badge
            variant="outline"
            className={cn("h-5 px-1.5", PRIORITY_TONE[task.priority])}
          >
            <FlagIcon className="size-3" />
            {TASK_PRIORITY_LABEL[task.priority]}
          </Badge>
          {task.status === "in_progress" ? (
            <Badge variant="outline" className="h-5 px-1.5 text-sky-300">
              <ClockIcon className="size-3" />
              In progress
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!done && task.status !== "in_progress" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={startProgress}
            className="text-muted-foreground hidden sm:inline-flex"
          >
            Start
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Edit task"
          onClick={() => setEditing(true)}
        >
          <PencilSimpleIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Delete task"
          disabled={isPending}
          onClick={remove}
          className="text-muted-foreground hover:text-red-300"
        >
          <TrashIcon className="size-4" />
        </Button>
      </div>

      {editing ? (
        <EditTaskDialog
          task={task}
          clients={clients}
          open={editing}
          onOpenChange={setEditing}
        />
      ) : null}
    </li>
  );
}

export function TaskManager({
  tasks,
  clients,
}: {
  tasks: TaskWithClient[];
  clients: ClientOption[];
}) {
  const sorted = sortTasks(tasks);
  const open = sorted.filter((t) => t.status !== "done");
  const done = sorted.filter((t) => t.status === "done");
  const [showAllDone, setShowAllDone] = useState(false);
  const visibleDone = showAllDone ? done : done.slice(0, DONE_LIMIT);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="pt-6">
          <QuickAddForm clients={clients} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-glass-border border-b">
          <CardTitle>
            Open tasks{open.length > 0 ? ` (${open.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {open.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Nothing on the list. Add the jobs you&apos;re juggling above.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 pt-4">
              {open.map((task) => (
                <TaskRow key={task.id} task={task} clients={clients} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {done.length > 0 ? (
        <Card>
          <CardHeader className="border-glass-border border-b">
            <CardTitle>Done ({done.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 pt-4">
              {visibleDone.map((task) => (
                <TaskRow key={task.id} task={task} clients={clients} />
              ))}
            </ul>
            {done.length > DONE_LIMIT && !showAllDone ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setShowAllDone(true)}
              >
                Show all {done.length}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
