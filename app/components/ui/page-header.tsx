
import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function PageHeader({
  title,
  description,
  actions,
  onRefresh,
  refreshing = false,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{title}</h1>
        {description && (
          <p className="text-sm sm:text-base text-gray-600 mt-1">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}
