"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  ReactNode,
} from "react";

interface SidebarContextType {
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const STORAGE_KEY = "sidebar";
const listeners = new Set<() => void>();
let defaultCollapsed: boolean | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb); // sinkron antar tab
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): boolean {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage tidak tersedia -> pakai default
  }
  if (saved !== null) return saved === "collapsed";
  // Belum pernah disimpan:
  // Desktop (>= 1024px) => OPEN (false), Mobile (< 1024px) => CLOSED (true)
  // Dihitung sekali saja (seperti sebelumnya, hanya saat load) supaya resize
  // jendela tidak membalik sidebar saat komponen re-render.
  if (defaultCollapsed === null) defaultCollapsed = window.innerWidth < 1024;
  return defaultCollapsed;
}

// Di server / saat hydration: selalu OPEN (sama seperti state awal sebelumnya).
function getServerSnapshot(): boolean {
  return false;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const isCollapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const setIsCollapsed = useCallback((collapsed: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "open");
    } catch {
      // abaikan
    }
    listeners.forEach((l) => l());
  }, []);

  return (
    <SidebarContext.Provider
      value={{
        isCollapsed,
        setIsCollapsed,
        isMobileOpen,
        setIsMobileOpen,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
