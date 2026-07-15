-- TD Studios Invoice App — admin task management (the dashboard to-do list)
--
-- Personal job/task tracking for the admin dashboard. Tasks are plain
-- owner-scoped rows: optionally linked to a client (the "job" it belongs to),
-- with a status, priority, and due date. No portal or customer access — the
-- only policy is owner-all, so the anon key and other users see nothing.

create type public.task_status as enum ('todo', 'in_progress', 'done');
create type public.task_priority as enum ('low', 'medium', 'high');

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   uuid references public.clients (id) on delete set null,
  title       text not null,
  notes       text,
  status      public.task_status not null default 'todo',
  priority    public.task_priority not null default 'medium',
  due_date    date,
  completed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tasks_owner_status_idx on public.tasks (owner_id, status, due_date);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

-- Owner-only CRUD. A linked client must also belong to the caller, so a task
-- can never point at (and leak the existence of) someone else's client.
create policy tasks_owner_all on public.tasks
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (
      client_id is null
      or exists (
        select 1 from public.clients c
        where c.id = client_id and c.owner_id = (select auth.uid())
      )
    )
  );
