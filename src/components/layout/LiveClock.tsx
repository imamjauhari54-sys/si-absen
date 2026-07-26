"use client";

import { useEffect, useState } from "react";

export default function LiveClock() {
  const [jam, setJam] = useState("--:--:--");

  useEffect(() => {
    function update() {
      const now = new Date();
      setJam(
        [now.getHours(), now.getMinutes(), now.getSeconds()]
          .map((n) => String(n).padStart(2, "0"))
          .join(":")
      );
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs sm:text-sm font-bold text-indigo-600 bg-indigo-100 border border-indigo-200 rounded-lg dark:text-indigo-400 dark:bg-indigo-500/10 dark:border-indigo-500/20">
      <i className="fas fa-clock opacity-70 hidden! sm:inline-block!" />
      <span>{jam}</span>
    </div>
  );
}
