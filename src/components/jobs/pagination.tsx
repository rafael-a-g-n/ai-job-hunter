import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pageSize,
  total,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  /** The current filters, without `page`. */
  params: URLSearchParams;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const next = new URLSearchParams(params);
    if (p > 1) next.set("page", String(p));
    const qs = next.toString();
    return qs ? `/jobs?${qs}` : "/jobs";
  };

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
      {page > 1 ? (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={href(page - 1)} />}
        >
          Previous
        </Button>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={href(page + 1)} />}
        >
          Next
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
