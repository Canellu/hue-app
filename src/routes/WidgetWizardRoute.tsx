import { WidgetWizard } from "@/features/settings-screen/components/WidgetWizard";
import { useWidgets } from "@/features/widget-screen/useWidgets";
import { useNavigate } from "@tanstack/react-router";

export const WidgetWizardRoute: React.FC = () => {
  const navigate = useNavigate();
  const { openWidget } = useWidgets();

  // Back-out is handled by the global AppHeader's top-left back control
  // (RootLayout wires it to settings → widget tab), so the wizard itself only
  // needs the create handler.
  return (
    <WidgetWizard
      onCreate={(options) => {
        void navigate({ to: "/settings", search: { tab: "widget" } });
        void openWidget(undefined, options);
      }}
    />
  );
};
