import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="mb-6 space-y-2">
        <SkeletonBlock className="h-7 w-48" />
        <SkeletonBlock className="h-4 w-full max-w-2xl" />
      </div>
      <div className="space-y-6">
        <SkeletonBlock className="h-28" />
        <div className="section-card p-5 sm:p-6 shadow-sm space-y-4">
          <SkeletonBlock className="h-5 w-56" />
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-12 w-full" />
        </div>
        <div className="section-card p-5 sm:p-6 shadow-sm space-y-3">
          <SkeletonBlock className="h-5 w-40" />
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-10 w-full" />
          ))}
          <SkeletonBlock className="h-11 w-48 ml-auto" />
        </div>
      </div>
    </div>
  );
}
