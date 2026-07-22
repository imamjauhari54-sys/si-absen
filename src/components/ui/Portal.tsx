"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

function subscribe() {
  return () => {};
}
function getClientSnapshot() {
  return true;
}
function getServerSnapshot() {
  return false;
}

/**
 * Semua modal di app ini dibungkus komponen ini. Alasan: elemen manapun
 * dengan `transform`, `filter`, atau `backdrop-filter` yang aktif (termasuk
 * animasi CSS yang sedang berjalan) membuat ancestor tsb menjadi containing
 * block baru untuk descendant `position: fixed` — modal jadi "terkurung" di
 * kotak ancestor itu alih-alih menutup seluruh viewport. Render lewat portal
 * ke document.body menghilangkan masalah ini sepenuhnya, apa pun CSS di
 * ancestor pemanggilnya.
 *
 * Deteksi "sudah di client" pakai useSyncExternalStore (bukan
 * useEffect+setState) supaya tidak memicu render tambahan yang tidak perlu.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
