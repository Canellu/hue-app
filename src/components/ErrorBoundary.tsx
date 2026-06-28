import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";

interface ErrorFallbackProps {
  error: Error;
  componentStack: string | null;
  onReset: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Custom fallback to render in place of the default full-screen ErrorScreen —
   * e.g. the widget window supplies a compact, shell-backed fallback sized for
   * its small window. Receives the caught error and a reset handler.
   */
  fallback?: (props: ErrorFallbackProps) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

/**
 * App-level error boundary: catches any render/lifecycle error from the tree
 * below it and swaps in the friendly ErrorScreen fallback instead of letting
 * React unmount to a blank window. "Try again" clears the caught error to
 * re-mount the subtree; ErrorScreen also offers a full reload as a fallback.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    console.error("Uncaught error in app:", error, info);
  }

  handleReset = () => {
    this.setState({ error: null, componentStack: null });
  };

  render() {
    const { error, componentStack } = this.state;

    if (error) {
      if (this.props.fallback) {
        return this.props.fallback({
          error,
          componentStack,
          onReset: this.handleReset,
        });
      }
      return (
        <ErrorScreen
          error={error}
          componentStack={componentStack}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}
