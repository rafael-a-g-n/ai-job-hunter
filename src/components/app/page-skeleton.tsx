import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder for a page body: a few card-shaped blocks. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="grid gap-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-2/3 rounded-xl" />
    </div>
  );
}
