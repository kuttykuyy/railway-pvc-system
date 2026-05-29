
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface TableSkeletonProps {
  columns: number;
  rows?: number;
  showCheckbox?: boolean;
}

export function TableSkeleton({ columns, rows = 5, showCheckbox = false }: TableSkeletonProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showCheckbox && (
              <TableHead className="w-12">
                <Skeleton className="h-4 w-4" />
              </TableHead>
            )}
            {Array.from({ length: columns }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-24" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {showCheckbox && (
                <TableCell>
                  <Skeleton className="h-4 w-4" />
                </TableCell>
              )}
              {Array.from({ length: columns }).map((_, colIndex) => (
                <TableCell key={colIndex}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
