import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

/**
 * Header action for the Devices tab. The button always keeps its text rather
 * than collapsing to an icon-only control.
 */
export const AddDevicesButton = ({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) => (
  <Button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="shrink-0"
  >
    <Plus size={16} />
    Add device
  </Button>
);
