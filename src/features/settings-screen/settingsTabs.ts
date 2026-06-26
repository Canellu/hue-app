import {
  Blocks,
  Boxes,
  Home,
  Monitor,
  Palette,
  Router,
  type LucideIcon,
} from "lucide-react";

export const settingsTabs = [
  {
    value: "app",
    label: "General",
    description: "Set app appearance and desktop window behavior.",
    icon: Monitor,
  },
  {
    value: "widget",
    label: "Widget",
    description: "Prepare pinned desktop widget windows.",
    icon: Blocks,
  },
  {
    value: "bridge",
    label: "Bridge",
    description: "Manage bridge connection and saved credentials.",
    icon: Router,
  },
  {
    value: "devices",
    label: "Devices",
    description: "Review Hue devices, sensors, switches, and connectivity.",
    icon: Boxes,
  },
  {
    value: "spaces",
    label: "Rooms & Zones",
    description: "Organize rooms, zones, lights, and memberships.",
    icon: Home,
  },
  {
    value: "scenes",
    label: "Scenes",
    description: "Create and manage room and zone scenes.",
    icon: Palette,
  },
] satisfies Array<{
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
}>;
