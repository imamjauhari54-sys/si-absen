import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="mb-6 space-y-2">
        <SkeletonBlock className="h-7 w-40" />
        <SkeletonBlock className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SkeletonBlock className="h-56" />
          <SkeletonBlock className="h-40" />
        </div>
        <div className="space-y-6">
          <SkeletonBlock className="h-48" />
          <SkeletonBlock className="h-40" />
        </div>
      </div>
    </div>
  );
}
