import { Skeleton } from "@/components/ui/skeleton"

/** Shown the moment a link is clicked, while the server is still loading the next page. */
export function PageSkeleton({ className = "" }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={`flex w-full flex-col gap-4 ${className}`}>
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  )
}
