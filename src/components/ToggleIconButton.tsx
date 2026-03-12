import * as React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToggleIconButtonProps {
  active: boolean;
  onClick: () => void;
  title: string;
  iconWhenActive: LucideIcon;
  iconWhenInactive: LucideIcon;
  className?: string;
  iconClassName?: string;
}

/**
 * Shared toggle icon button. When active, uses highlighted (red) background.
 */
export const ToggleIconButton = ({
  active,
  onClick,
  title,
  iconWhenActive: IconActive,
  iconWhenInactive: IconInactive,
  className,
  iconClassName = "w-3 h-3",
}: ToggleIconButtonProps) => {
  const Icon = active ? IconActive : IconInactive;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center justify-center h-6 w-6 rounded border transition-colors",
        active
          ? "border-red-500/60 bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/40",
        className
      )}
    >
      <Icon className={iconClassName} />
    </button>
  );
};
