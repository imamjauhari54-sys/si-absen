"use client";

import { useState } from "react";
import ImportSiswaModal from "./ImportSiswaModal";

export default function ImportSiswaButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
      >
        <i className="fas fa-file-import" />
        Import CSV
      </button>

      {open && <ImportSiswaModal onClose={() => setOpen(false)} />}
    </>
  );
}
