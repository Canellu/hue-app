import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus } from "lucide-react";

/**
 * Header action for the Widget tab. Mirrors {@link AddDevicesButton}: it always
 * keeps its label and shows a transient "Opening..." state while a new widget
 * window is being spawned.
 */
export const AddWidgetButton = ({
  loading,
  disabled,
  disabledReason,
  onClick,
}: {
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
}) => {
  const button = (
    <Button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="shrink-0"
    >
      <Plus size={16} />
      {loading ? "Opening..." : "Add widget"}
    </Button>
  );

  if (!disabled || !disabledReason) return button;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<span className="inline-flex">{button}</span>}
        />
        <TooltipContent side="bottom" align="end" className="max-w-64">
          {disabledReason}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
