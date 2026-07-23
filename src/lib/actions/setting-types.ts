export interface SettingActionState {
  status: "idle" | "ok" | "error";
  message: string;
}

export const settingInitialState: SettingActionState = { status: "idle", message: "" };
