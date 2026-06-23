// Shared shape returned by form Server Actions, consumed via useActionState.
export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

export const initialActionState: ActionState = {};
