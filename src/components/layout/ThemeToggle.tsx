"use client";

import { useState } from "react";

export default function ThemeToggle({ initialDark }: { initialDark: boolean }) {
  const [isDark, setIsDark] = useState(initialDark);

  function toggleTheme() {
    const html = document.documentElement;
    html.classList.toggle("dark");
    const nowDark = html.classList.contains("dark");
    document.cookie = `theme=${nowDark ? "dark" : "light"}; path=/; max-age=31536000`;
    setIsDark(nowDark);
  }

  return (
    <button onClick={toggleTheme} className="btn-theme-toggle" aria-label="Ganti tema">
      <i className={`fas ${isDark ? "fa-moon" : "fa-sun"}`} />
    </button>
  );
}
