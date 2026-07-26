"use client";

import { useState } from "react";
import SiswaFormModal from "./SiswaFormModal";

export default function TambahSiswaButton({ semuaKelas }: { semuaKelas: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
      >
        <i className="fas fa-user-plus" />
        Tambah Siswa
      </button>

      {open && <SiswaFormModal mode="create" semuaKelas={semuaKelas} onClose={() => setOpen(false)} />}
    </>
  );
}
