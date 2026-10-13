import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="mb-6 space-y-2">
        <SkeletonBlock className="h-7 w-44" />
        <SkeletonBlock className="h-4 w-full max-w-md" />
      </div>
      <SkeletonBlock className="h-4 w-64 mb-4" />
      <div className="section-card overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-gray-700/50">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-5 py-4 flex items-center gap-3">
            <SkeletonBlock className="h-9 w-9 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-48" />
              <SkeletonBlock className="h-3 w-full max-w-sm" />
            </div>
            <SkeletonBlock className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
