export default function Loading() {
  return (
    <div className="w-full px-4 pt-2 mb-14 flex items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-10 h-10 rounded-full border-4 border-indigo-100 dark:border-indigo-900/40 border-t-indigo-600 dark:border-t-indigo-400 animate-spin"
          role="status"
          aria-label="Memuat"
        />
        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Memuat...</span>
      </div>
    </div>
  );
}
