
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface CardSkeletonProps {
  showHeader?: boolean;
  rows?: number;
}

export function CardSkeleton({ showHeader = true, rows = 3 }: CardSkeletonProps) {
  return (
    <Card>
      {showHeader && (
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} showHeader={false} rows={2} />
      ))}
    </div>
  );
}
