'use client';

/**
 * The contract page's secondary actions, behind one "More" button.
 *
 * Six buttons in a row beside the title left the page with no primary action and the
 * title squeezed into a corner. The header now leads with Add bill; the documents and
 * analyses a person reaches for less often live here, one click away, each named as
 * before.
 */

import Link from 'next/link';
import { ChevronDown, FileText, Calendar, BarChart3, FileSpreadsheet } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ContractMoreMenu({ contractId, extensionCount }: { contractId: string; extensionCount: number }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 bg-white hover:bg-gray-50"
      >
        More <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">Documents</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={`/contracts/${contractId}/covering-letter`} className="flex items-center gap-2 cursor-pointer">
            <FileText className="h-4 w-4" /> Covering letter
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          {/* The whole contract's PVC on one grid, plus the JPC working — the layout
              accounts offices keep by hand, computed. */}
          <a href={`/api/contracts/${contractId}/master-sheet`} className="flex items-center gap-2 cursor-pointer">
            <FileSpreadsheet className="h-4 w-4" /> Master sheet (PDF)
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">Analysis</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={`/contracts/${contractId}/extensions`} className="flex items-center gap-2 cursor-pointer">
            <Calendar className="h-4 w-4" /> Extensions
            {extensionCount > 0 && (
              <span className="ml-auto text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full">{extensionCount}</span>
            )}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/contracts/${contractId}/quarterly-averages`} className="flex items-center gap-2 cursor-pointer">
            <BarChart3 className="h-4 w-4" /> Quarterly averages
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
