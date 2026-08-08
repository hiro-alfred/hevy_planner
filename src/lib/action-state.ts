// Shared result shape for server actions.
//
// This lives outside any "use server" module on purpose: those files may only
// export async functions, so a constant or a type declared beside the actions
// would break the build.

export interface ActionState {
  status: "idle" | "success" | "error";
  message: string;
}

export const IDLE: ActionState = { status: "idle", message: "" };

export function errorState(message: string): ActionState {
  return { status: "error", message };
}

export function successState(message: string): ActionState {
  return { status: "success", message };
}
