
import { AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatusMessageProps {
  type: "error" | "success" | "info" | "warning";
  title?: string;
  message: string;
  className?: string;
}

const typeConfig = {
  error: {
    icon: AlertCircle,
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    textColor: "text-red-900",
    iconColor: "text-red-600"
  },
  success: {
    icon: CheckCircle,
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    textColor: "text-green-900",
    iconColor: "text-green-600"
  },
  info: {
    icon: Info,
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    textColor: "text-emerald-900",
    iconColor: "text-emerald-600"
  },
  warning: {
    icon: AlertTriangle,
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    textColor: "text-amber-900",
    iconColor: "text-amber-600"
  }
};

export function StatusMessage({ type, title, message, className }: StatusMessageProps) {
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div className={cn(
      "flex gap-3 p-4 rounded-lg border-2",
      config.bgColor,
      config.borderColor,
      config.textColor,
      className
    )}>
      <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", config.iconColor)} />
      <div className="flex-1">
        {title && (
          <h4 className="font-semibold text-sm sm:text-base mb-1">{title}</h4>
        )}
        <p className="text-sm sm:text-base">{message}</p>
      </div>
    </div>
  );
}
