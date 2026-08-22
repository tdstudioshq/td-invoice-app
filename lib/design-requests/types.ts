import type {
  CustomDesignRequestStatus,
  CustomDesignType,
} from "@/lib/types/database";

export const CUSTOM_DESIGN_TYPES = [
  "Bag design",
  "Jar design",
  "Other",
] as const satisfies readonly CustomDesignType[];

export const CUSTOM_DESIGN_REQUEST_STATUSES = [
  "new",
  "reviewing",
  "quoted",
  "in_progress",
  "completed",
  "cancelled",
] as const satisfies readonly CustomDesignRequestStatus[];

export const CUSTOM_DESIGN_REQUEST_STATUS_LABEL: Record<
  CustomDesignRequestStatus,
  string
> = {
  new: "New",
  reviewing: "Reviewing",
  quoted: "Quoted",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type { CustomDesignRequestStatus, CustomDesignType };
