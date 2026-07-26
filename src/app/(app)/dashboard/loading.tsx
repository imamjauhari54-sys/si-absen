import { SkeletonBlock, SkeletonKpiRow } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="mb-6 space-y-2">
        <SkeletonBlock className="h-7 w-56" />
        <SkeletonBlock className="h-4 w-72" />
      </div>

      <SkeletonKpiRow count={4} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SkeletonBlock className="h-80 lg:col-span-2" />
        <div className="space-y-6">
          <SkeletonBlock className="h-36" />
          <SkeletonBlock className="h-40" />
        </div>
      </div>
    </div>
  );
}
