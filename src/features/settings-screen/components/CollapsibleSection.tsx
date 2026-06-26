import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { FLAT_CARD } from "../constants";

/**
 * A panel whose body collapses behind a header that doubles as a toggle. Open
 * state is owned by the parent so the Devices tab can drive expand/collapse all.
 */
export const CollapsibleSection = ({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <Card className={cn("gap-0 py-0", FLAT_CARD)}>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40"
    >
      <span className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {count != null && (
          <Badge variant="secondary" className="tabular-nums">
            {count}
          </Badge>
        )}
      </span>
      <ChevronDown
        size={16}
        className={cn(
          "shrink-0 text-muted-foreground transition-transform",
          open && "rotate-180",
        )}
      />
    </button>
    {open && <div className="px-5 pb-5">{children}</div>}
  </Card>
);
