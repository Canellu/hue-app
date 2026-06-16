import { invoke } from "@tauri-apps/api/core";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface HueSession {
  configured: boolean;
  connected: boolean;
  bridgeId: string | null;
  bridgeIp: string | null;
  applicationKey: string | null;
  error: string | null;
}

interface HueContextType extends HueSession {
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  applySession: (session: HueSession) => void;
  resetSession: () => Promise<void>;
}

const emptySession: HueSession = {
  configured: false,
  connected: false,
  bridgeId: null,
  bridgeIp: null,
  applicationKey: null,
  error: null,
};

const HueContext = createContext<HueContextType | undefined>(undefined);

interface HueProviderProps {
  children: ReactNode;
}

export const HueProvider: React.FC<HueProviderProps> = ({ children }) => {
  const [session, setSession] = useState<HueSession>(emptySession);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextSession = await invoke<HueSession>("get-hue-session");
      setSession(nextSession);
    } catch (error) {
      setSession({
        ...emptySession,
        error: String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applySession = useCallback((nextSession: HueSession) => {
    setSession(nextSession);
    setIsLoading(false);
  }, []);

  const resetSession = useCallback(async () => {
    await invoke("reset-hue-session");
    setSession(emptySession);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  return (
    <HueContext.Provider
      value={{
        ...session,
        isLoading,
        refreshSession,
        applySession,
        resetSession,
      }}
    >
      {children}
    </HueContext.Provider>
  );
};

export const useHue = () => {
  const context = useContext(HueContext);
  if (!context) {
    throw new Error("useHue must be used within a HueProvider");
  }
  return context;
};
