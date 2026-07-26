/**
 * Building block skeleton loading — dipakai di file loading.tsx tiap
 * halaman supaya bentuknya mengikuti layout asli halaman itu (skeleton),
 * bukan spinner generik yang sama untuk semua halaman. Tujuannya biar
 * transisi pindah halaman terasa lebih mulus & nggak ada lompatan layout
 * begitu data aslinya muncul.
 */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700/50 rounded-xl ${className}`} />;
}

export function SkeletonHeader() {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
      <div className="space-y-2">
        <SkeletonBlock className="h-7 w-48" />
        <SkeletonBlock className="h-4 w-64" />
      </div>
      <SkeletonBlock className="h-10 w-40" />
    </div>
  );
}

export function SkeletonKpiRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className="h-24" />
      ))}
    </div>
  );
}

export function SkeletonFilterBar() {
  return (
    <div className="section-card p-4 sm:p-5 mb-6 shadow-sm">
      <div className="flex flex-col sm:flex-row gap-3">
        <SkeletonBlock className="h-10 flex-1" />
        <SkeletonBlock className="h-10 w-24" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="section-card overflow-hidden shadow-sm">
      <div className="p-5 border-b border-gray-100 dark:border-gray-800">
        <SkeletonBlock className="h-5 w-40" />
      </div>
      <div className="p-5 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonBlock key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
