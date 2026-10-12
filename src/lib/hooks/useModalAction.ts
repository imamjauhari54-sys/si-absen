"use client";

import { useActionState, useState } from "react";
import { settingInitialState, type SettingActionState } from "@/lib/actions/setting-types";

type ActionFn = (prev: SettingActionState, formData: FormData) => Promise<SettingActionState>;

/**
 * Pola "tombol → modal form → notifikasi hasil" untuk server action.
 * Tanpa useEffect: modal form otomatis tertutup begitu server action selesai (state berganti
 * objek), lalu NotifModal tampil sampai ditutup.
 */
export function useModalAction(action: ActionFn) {
  const [state, formAction, pending] = useActionState(action, settingInitialState);
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState<SettingActionState>(state);
  const [dismissed, setDismissed] = useState<SettingActionState | null>(null);

  return {
    state,
    formAction,
    pending,
    modalVisible: open && state === base,
    notifOpen: state.status !== "idle" && state !== dismissed,
    buka: () => {
      setBase(state);
      setOpen(true);
    },
    tutup: () => setOpen(false),
    tutupNotif: () => setDismissed(state),
  };
}
