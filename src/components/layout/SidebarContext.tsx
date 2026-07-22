"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface SidebarContextType {
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsedState] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sidebar");
    if (saved !== null) {
      setIsCollapsedState(saved === "collapsed");
    } else {
      // Jika saved == null:
      // Desktop (>= 1024px) => OPEN (isCollapsed = false)
      // Mobile (< 1024px) => CLOSED (isCollapsed = true)
      if (window.innerWidth >= 1024) {
        setIsCollapsedState(false);
      } else {
        setIsCollapsedState(true);
      }
    }
  }, []);

  const setIsCollapsed = (collapsed: boolean) => {
    setIsCollapsedState(collapsed);
    localStorage.setItem("sidebar", collapsed ? "collapsed" : "open");
  };

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
