"use client";

import { useState } from "react";
import UserFormModal from "./UserFormModal";

export default function TambahUserButton({ semuaKelas, currentUserId }: { semuaKelas: string[]; currentUserId: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
      >
        <i className="fas fa-user-plus" />
        Tambah Pengguna
      </button>

      {open && (
        <UserFormModal mode="create" semuaKelas={semuaKelas} currentUserId={currentUserId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
