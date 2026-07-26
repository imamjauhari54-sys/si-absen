import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="w-full px-4 pt-2 mb-14 max-w-2xl">
      <div className="mb-6 space-y-2">
        <SkeletonBlock className="h-7 w-40" />
        <SkeletonBlock className="h-4 w-80" />
      </div>
      <div className="section-card overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-gray-700/50">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-5 py-4 flex gap-3 items-start">
            <SkeletonBlock className="h-9 w-9 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
