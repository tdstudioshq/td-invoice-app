import { AlertTriangle, CalendarClock, ListTodo, Loader } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { TaskManager } from "@/components/dashboard/task-manager";
import { getClients, getTasks } from "@/lib/data";
import { isDueToday, isOverdue, todayISODate } from "@/lib/tasks";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [tasks, clients] = await Promise.all([getTasks(), getClients()]);
  const today = todayISODate();

  const open = tasks.filter((t) => t.status !== "done");
  const inProgress = open.filter((t) => t.status === "in_progress");
  const dueToday = open.filter((t) => isDueToday(t, today));
  const overdue = open.filter((t) => isOverdue(t, today));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Every job you're juggling, in one list."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open tasks"
          value={String(open.length)}
          icon={ListTodo}
        />
        <StatCard
          label="In progress"
          value={String(inProgress.length)}
          icon={Loader}
        />
        <StatCard
          label="Due today"
          value={String(dueToday.length)}
          icon={CalendarClock}
          accent={dueToday.length > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Overdue"
          value={String(overdue.length)}
          hint={overdue.length > 0 ? "Needs attention" : "Nothing slipping"}
          icon={AlertTriangle}
          accent={overdue.length > 0 ? "warning" : "default"}
        />
      </div>

      <TaskManager
        tasks={tasks}
        clients={clients.map(({ id, company_name }) => ({ id, company_name }))}
      />
    </>
  );
}
