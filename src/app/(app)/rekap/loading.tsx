import { SkeletonHeader, SkeletonFilterBar, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="w-full px-4 pt-2 mb-14">
      <SkeletonHeader />
      <SkeletonFilterBar />
      <SkeletonTable rows={10} />
    </div>
  );
}
