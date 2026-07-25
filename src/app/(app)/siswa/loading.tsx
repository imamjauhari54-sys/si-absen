import { SkeletonHeader, SkeletonKpiRow, SkeletonFilterBar, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="w-full px-4 pt-2 mb-14">
      <SkeletonHeader />
      <SkeletonKpiRow count={4} />
      <SkeletonFilterBar />
      <SkeletonTable rows={8} />
    </div>
  );
}
