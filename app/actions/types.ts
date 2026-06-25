// Shared shape returned by form Server Actions, consumed via useActionState.
export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  // Optional one-off payload returned on success (e.g. a generated temp password
  // to display once). Keep small and non-sensitive-by-default.
  data?: Record<string, string>;
}

export const initialActionState: ActionState = {};
