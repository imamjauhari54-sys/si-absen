import { SkeletonBlock, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="w-full px-4 pt-2 mb-14 max-w-2xl">
      <div className="mb-6 space-y-2">
        <SkeletonBlock className="h-7 w-40" />
        <SkeletonBlock className="h-4 w-80" />
      </div>
      <SkeletonBlock className="h-32 mb-6" />
      <SkeletonTable rows={5} />
    </div>
  );
}
