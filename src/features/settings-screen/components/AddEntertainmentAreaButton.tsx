import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const AddEntertainmentAreaButton = ({
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
    Add entertainment area
  </Button>
);
