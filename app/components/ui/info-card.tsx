
import * as React from "react"
import { Info, AlertCircle, CheckCircle, HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface InfoCardProps {
  children: React.ReactNode;
  title?: string;
  type?: "info" | "warning" | "success" | "help";
  className?: string;
}

const typeStyles = {
  info: {
    container: "bg-blue-50 border-blue-200 text-blue-900",
    icon: "text-blue-600",
    title: "text-blue-900",
    Icon: Info
  },
  warning: {
    container: "bg-amber-50 border-amber-200 text-amber-900",
    icon: "text-amber-600",
    title: "text-amber-900",
    Icon: AlertCircle
  },
  success: {
    container: "bg-green-50 border-green-200 text-green-900",
    icon: "text-green-600",
    title: "text-green-900",
    Icon: CheckCircle
  },
  help: {
    container: "bg-purple-50 border-purple-200 text-purple-900",
    icon: "text-purple-600",
    title: "text-purple-900",
    Icon: HelpCircle
  }
};

export function InfoCard({ 
  children, 
  title,
  type = "info",
  className 
}: InfoCardProps) {
  const style = typeStyles[type];
  const Icon = style.Icon;
  
  return (
    <div className={cn(
      "border-2 rounded-lg p-4 sm:p-5",
      style.container,
      className
    )}>
      <div className="flex gap-3 sm:gap-4">
        <div className="flex-shrink-0 mt-0.5">
          <Icon className={cn("h-6 w-6", style.icon)} />
        </div>
        <div className="flex-1 space-y-2">
          {title && (
            <h4 className={cn("font-semibold text-base sm:text-lg", style.title)}>
              {title}
            </h4>
          )}
          <div className="text-sm sm:text-base leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
