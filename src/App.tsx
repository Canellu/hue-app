import { RouterProvider } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import "./App.css";
import {
  AppContentTransition,
  type AppViewKey,
} from "@/components/AppContentTransition";
import { BridgeStatus } from "@/components/BridgeStatus";
import { DiscoveryWifi } from "@/components/DiscoveryWifi";
import { StatusScreen } from "@/components/StatusScreen";
import { Button } from "@/components/ui/button";
import { TitleBar } from "./components/TitleBar";
import { useHue } from "./context/HueContext";
import { router } from "./router";
import { WizardDevToolbar } from "./features/setup-wizard/components/WizardDevToolbar";
import {
  devNextSteps,
  wizardDevStates,
} from "./features/setup-wizard/constants";
import { useDevViews } from "./features/setup-wizard/hooks/useDevViews";
import { WizardContainer } from "./features/setup-wizard/WizardContainer";
import { bridgeKind } from "./features/setup-wizard/utils/bridge";

interface RenderedAppContent {
  viewKey: AppViewKey;
  content: ReactNode;
}

const HomeApp = () => (
  <div className="h-full">
    <RouterProvider router={router} />
  </div>
);

const LoadingConnectionView = () => (
  <StatusScreen
    visual={<DiscoveryWifi />}
    title="Checking connection…"
    titleClassName="text-shimmer"
    description="Restoring your saved Hue Bridge session."
  />
);

const DisconnectedBridgeView = ({
  error,
  onRetry,
  onPairNewBridge,
}: {
  error: string | null;
  onRetry: () => void;
  onPairNewBridge: () => void;
}) => (
  <StatusScreen
    visual={<BridgeStatus kind={bridgeKind()} status="error" />}
    title="Bridge unavailable"
    description={error ?? "The saved bridge could not be reached."}
    actions={
      <div className="flex gap-3">
        <Button size="xl" variant="outline" onClick={onPairNewBridge}>
          Pair a new bridge
        </Button>
        <Button size="xl" onClick={onRetry}>
          Retry connection
        </Button>
      </div>
    }
  />
);

function App() {
  const {
    configured,
    connected,
    error,
    isLoading,
    refreshSession,
    resetSession,
  } = useHue();
  const dev = useDevViews();
  const [pairNewBridge, setPairNewBridge] = useState(false);

  // Dev preview path: the wizard dev toolbar drives which mock view shows.
  const renderDevContent = (): RenderedAppContent => {
    if (dev.viewId === "home-preview") {
      return { viewKey: "home-preview", content: <HomeApp /> };
    }

    if (dev.viewId === "loading" || dev.retryLoading) {
      return { viewKey: "loading", content: <LoadingConnectionView /> };
    }

    if (dev.viewId === "disconnected") {
      return {
        viewKey: "disconnected",
        content: (
          <DisconnectedBridgeView
            error={null}
            onRetry={dev.startRetryTransition}
            onPairNewBridge={() => dev.selectView("discovering")}
          />
        ),
      };
    }

    return {
      viewKey: "wizard-dev",
      content: (
        <WizardContainer
          devMode
          devStateId={dev.viewId}
          onDevStateChange={dev.setViewId}
          onEnterHomePreview={() => dev.selectView("home-preview")}
          devBridgeCount={dev.bridgeCount}
          devPairingKind={dev.pairingKind}
          onDevPairingKindChange={dev.setPairingKind}
        />
      ),
    };
  };

  // Real path: the Hue session decides loading / home / disconnected / wizard.
  const renderSessionContent = (): RenderedAppContent => {
    if (isLoading) {
      return { viewKey: "loading", content: <LoadingConnectionView /> };
    }

    if (configured && connected) {
      return { viewKey: "home", content: <HomeApp /> };
    }

    if (configured) {
      return {
        viewKey: "disconnected",
        content: (
          <DisconnectedBridgeView
            error={error}
            onRetry={() => void refreshSession()}
            onPairNewBridge={() => {
              setPairNewBridge(true);
              void resetSession();
            }}
          />
        ),
      };
    }

    return {
      viewKey: "wizard",
      content: <WizardContainer autoStartDiscovery={pairNewBridge} />,
    };
  };

  const rendered = dev.enabled ? renderDevContent() : renderSessionContent();

  const selectedWizardDevState = wizardDevStates.find(
    (devState) => devState.id === dev.viewId,
  );
  const currentDevNextSteps = selectedWizardDevState
    ? devNextSteps[selectedWizardDevState.state.type]
    : undefined;

  return (
    <main className="h-screen overflow-hidden bg-background pt-10 text-foreground">
      <TitleBar
        onDevBack={
          dev.enabled && dev.viewId === "home-preview"
            ? () => dev.selectView("success")
            : undefined
        }
      />
      {dev.enabled && (
        <WizardDevToolbar
          value={dev.viewId}
          groups={dev.groups}
          nextSteps={currentDevNextSteps}
          onSelectState={dev.selectView}
          bridgeCount={dev.bridgeCount}
          onBridgeCountChange={dev.setBridgeCount}
          pairingKind={dev.pairingKind}
          onPairingKindChange={dev.setPairingKind}
        />
      )}
      <AppContentTransition viewKey={rendered.viewKey}>
        {rendered.content}
      </AppContentTransition>
    </main>
  );
}

export default App;
