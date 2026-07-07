import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

/**
 * Header action for the Bridge tab. Mirrors {@link AddDevicesButton}: opens the
 * pair-another-bridge flow. Always available since adding a bridge doesn't
 * depend on the current one being connected.
 */
export const AddBridgeButton = ({ onClick }: { onClick: () => void }) => (
  <Button type="button" onClick={onClick} className="shrink-0">
    <Plus size={16} />
    Add bridge
  </Button>
);
