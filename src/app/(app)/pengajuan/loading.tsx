import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="mb-6 space-y-2">
        <SkeletonBlock className="h-7 w-52" />
        <SkeletonBlock className="h-4 w-full max-w-lg" />
      </div>
      <div className="section-card overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-gray-700/50">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-5 py-4 space-y-2">
            <SkeletonBlock className="h-4 w-64" />
            <SkeletonBlock className="h-3 w-80 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
