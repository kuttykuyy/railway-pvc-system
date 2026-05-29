
import * as React from "react"
import { HelpCircle, Info } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface HelpTooltipProps {
  content: string | React.ReactNode;
  title?: string;
  icon?: "help" | "info";
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}

export function HelpTooltip({ 
  content, 
  title,
  icon = "help", 
  className,
  side = "right" 
}: HelpTooltipProps) {
  const Icon = icon === "help" ? HelpCircle : Info;
  
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center rounded-full",
              "text-blue-600 hover:text-blue-700 hover:bg-blue-50",
              "transition-colors duration-200",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
              "cursor-help",
              className
            )}
            onClick={(e) => e.preventDefault()}
          >
            <Icon className="h-5 w-5" />
            <span className="sr-only">Help</span>
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side={side} 
          className="max-w-xs sm:max-w-sm md:max-w-md p-4 text-base leading-relaxed"
        >
          {title && (
            <div className="font-semibold mb-2 text-base">{title}</div>
          )}
          <div className="text-sm text-gray-700">{content}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
