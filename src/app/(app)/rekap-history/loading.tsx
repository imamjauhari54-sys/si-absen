import { SkeletonBlock, SkeletonFilterBar, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="w-full px-4 pt-2 mb-14">
      <div className="flex items-center gap-4 mb-6">
        <SkeletonBlock className="h-10 w-10" />
        <div className="space-y-2">
          <SkeletonBlock className="h-6 w-40" />
          <SkeletonBlock className="h-4 w-56" />
        </div>
      </div>
      <SkeletonFilterBar />
      <SkeletonTable rows={10} />
    </div>
  );
}
