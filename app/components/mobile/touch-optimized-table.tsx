
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreVertical, 
  Edit, 
  Trash2, 
  Eye, 
  FileText, 
  ChevronRight,
  Calendar,
  DollarSign,
  Building2
} from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface TableItem {
  id: string;
  title: string;
  subtitle?: string;
  amount?: number;
  date?: Date;
  status?: string;
  metadata?: Record<string, any>;
}

interface TouchOptimizedTableProps {
  items: TableItem[];
  title: string;
  description?: string;
  emptyMessage?: string;
  onEdit?: (item: TableItem) => void;
  onDelete?: (item: TableItem) => void;
  onView?: (item: TableItem) => void;
  viewUrl?: (item: TableItem) => string;
  editUrl?: (item: TableItem) => string;
  isLoading?: boolean;
}

export default function TouchOptimizedTable({
  items,
  title,
  description,
  emptyMessage = "No items found",
  onEdit,
  onDelete,
  onView,
  viewUrl,
  editUrl,
  isLoading = false,
}: TouchOptimizedTableProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const handleItemSelect = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'paid':
      case 'completed':
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
      case 'cancelled':
      case 'inactive':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <div className="animate-pulse bg-gray-300 rounded h-6 w-32"></div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center space-x-4 p-4 border rounded-lg">
                  <div className="bg-gray-300 rounded h-10 w-10"></div>
                  <div className="flex-1 space-y-2">
                    <div className="bg-gray-300 rounded h-4 w-3/4"></div>
                    <div className="bg-gray-300 rounded h-3 w-1/2"></div>
                  </div>
                  <div className="bg-gray-300 rounded h-8 w-8"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && (
          <CardDescription>{description}</CardDescription>
        )}
        
        {selectedItems.size > 0 && (
          <div className="flex items-center justify-between bg-blue-50 rounded-lg p-2 mt-3">
            <span className="text-sm text-blue-800">
              {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex space-x-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedItems(new Set())}
              >
                Clear
              </Button>
              <Button size="sm">
                Actions
              </Button>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="text-center py-12 px-4">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">{emptyMessage}</p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center p-4 transition-colors",
                  selectedItems.has(item.id) ? "bg-blue-50" : "hover:bg-gray-50",
                  "active:bg-gray-100" // Touch feedback
                )}
              >
                {/* Item Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 truncate">
                        {item.title}
                      </h3>
                      
                      {item.subtitle && (
                        <p className="text-sm text-gray-500 truncate mt-1">
                          {item.subtitle}
                        </p>
                      )}
                      
                      {/* Metadata Row */}
                      <div className="flex items-center space-x-4 mt-2">
                        {item.date && (
                          <div className="flex items-center text-xs text-gray-500">
                            <Calendar className="h-3 w-3 mr-1" />
                            {format(item.date, 'MMM d, yyyy')}
                          </div>
                        )}
                        
                        {item.amount !== undefined && (
                          <div className="flex items-center text-xs text-gray-500">
                            <DollarSign className="h-3 w-3 mr-1" />
                            ₹{item.amount.toLocaleString('en-IN')}
                          </div>
                        )}
                        
                        {item.status && (
                          <Badge 
                            className={cn("text-xs", getStatusColor(item.status))}
                            variant="secondary"
                          >
                            {item.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 ml-4">
                  {viewUrl && (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="p-2 h-auto"
                    >
                      <Link href={viewUrl(item)}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-2 h-auto touch-manipulation"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {onView && (
                        <DropdownMenuItem 
                          onClick={() => onView(item)}
                          className="flex items-center"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                      )}
                      
                      {(onEdit || editUrl) && (
                        <DropdownMenuItem
                          onClick={() => onEdit?.(item)}
                          asChild={!!editUrl}
                          className="flex items-center"
                        >
                          {editUrl ? (
                            <Link href={editUrl(item)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </Link>
                          ) : (
                            <>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </>
                          )}
                        </DropdownMenuItem>
                      )}
                      
                      {onDelete && (
                        <DropdownMenuItem 
                          onClick={() => onDelete(item)}
                          className="flex items-center text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
