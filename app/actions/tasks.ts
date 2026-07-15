"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/tasks";
import type { ActionState } from "@/app/actions/types";
import type { TaskPriority, TaskStatus } from "@/lib/types/database";

// Dashboard task manager writes. RLS (tasks_owner_all, migration 0022) scopes
// every statement to the signed-in owner and verifies a linked client is
// theirs, so these actions only need auth + input validation.

const prioritySchema = z.enum(TASK_PRIORITIES as [TaskPriority, ...TaskPriority[]]);
const statusSchema = z.enum(TASK_STATUSES as [TaskStatus, ...TaskStatus[]]);
const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid due date")
  .nullable();

const taskFieldsSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(300),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  priority: prioritySchema,
  due_date: dueDateSchema,
  client_id: z.string().uuid().nullable(),
});

function parseTaskFields(formData: FormData) {
  const rawDue = String(formData.get("due_date") ?? "").trim();
  const rawClient = String(formData.get("client_id") ?? "").trim();
  return taskFieldsSchema.safeParse({
    title: formData.get("title"),
    notes: formData.get("notes") ?? "",
    priority: formData.get("priority") || "medium",
    due_date: rawDue === "" ? null : rawDue,
    client_id: rawClient === "" || rawClient === "none" ? null : rawClient,
  });
}

async function requireDb() {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." } as const;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." } as const;
  return { supabase, userId: user.id } as const;
}

export async function createTaskAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseTaskFields(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid task." };
  }

  const db = await requireDb();
  if ("error" in db) return { error: db.error };

  const { error } = await db.supabase.from("tasks").insert({
    owner_id: db.userId,
    title: parsed.data.title,
    notes: parsed.data.notes || null,
    priority: parsed.data.priority,
    due_date: parsed.data.due_date,
    client_id: parsed.data.client_id,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateTaskAction(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = taskFieldsSchema
    .extend({ status: statusSchema })
    .safeParse({
      title: formData.get("title"),
      notes: formData.get("notes") ?? "",
      priority: formData.get("priority") || "medium",
      status: formData.get("status") || "todo",
      due_date:
        String(formData.get("due_date") ?? "").trim() === ""
          ? null
          : String(formData.get("due_date")).trim(),
      client_id:
        ["", "none"].includes(String(formData.get("client_id") ?? "").trim())
          ? null
          : String(formData.get("client_id")).trim(),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid task." };
  }

  const db = await requireDb();
  if ("error" in db) return { error: db.error };

  const { error } = await db.supabase
    .from("tasks")
    .update({
      title: parsed.data.title,
      notes: parsed.data.notes || null,
      priority: parsed.data.priority,
      status: parsed.data.status,
      completed_at: parsed.data.status === "done" ? new Date().toISOString() : null,
      due_date: parsed.data.due_date,
      client_id: parsed.data.client_id,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

export async function setTaskStatusAction(
  id: string,
  status: TaskStatus,
): Promise<ActionState> {
  const parsedStatus = statusSchema.safeParse(status);
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedStatus.success || !parsedId.success) {
    return { error: "Invalid task update." };
  }

  const db = await requireDb();
  if ("error" in db) return { error: db.error };

  const { error } = await db.supabase
    .from("tasks")
    .update({
      status: parsedStatus.data,
      completed_at:
        parsedStatus.data === "done" ? new Date().toISOString() : null,
    })
    .eq("id", parsedId.data);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteTaskAction(id: string): Promise<ActionState> {
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return { error: "Invalid task." };

  const db = await requireDb();
  if ("error" in db) return { error: db.error };

  const { error } = await db.supabase
    .from("tasks")
    .delete()
    .eq("id", parsedId.data);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}
