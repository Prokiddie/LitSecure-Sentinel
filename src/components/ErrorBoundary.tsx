import React from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

interface EBProps { children: React.ReactNode; }
interface EBState { hasError: boolean; error: Error | null; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactComponent = React.Component as any;

class ErrorBoundary extends ReactComponent {
  constructor(props: EBProps) {
    super(props);
    (this as any).state = { hasError: false, error: null } as EBState;
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught error:", error, info);
  }

  render(): React.ReactNode {
    const self = this as any;
    if (self.state?.hasError) {
      return (
        <div className="min-h-screen bg-[#05080F] flex flex-col items-center justify-center p-8 text-slate-100 relative">
          <div className="absolute inset-0 bg-[#05080F]/85" />
          <div className="relative z-10 max-w-lg w-full text-center space-y-5">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500/25 mb-2">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <div className="font-bebas text-3xl text-white tracking-widest">PLATFORM ERROR</div>
            <p className="text-sm text-slate-400">
              An unexpected error occurred in the Sentinel interface. The error has been logged.
            </p>
            {self.state?.error && (
              <div className="bg-[#0A0E1A] border border-white/10 rounded-xl p-4 text-left font-mono text-xs text-red-400 overflow-auto max-h-40">
                <p className="font-bold text-red-300 mb-1">{self.state.error.name}</p>
                <p>{self.state.error.message}</p>
              </div>
            )}
            <button
              onClick={() => {
                self.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="btn-accent inline-flex items-center gap-2 px-6 py-2.5 rounded text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              RELOAD SENTINEL
            </button>
          </div>
        </div>
      );
    }
    return self.props?.children ?? null;
  }
}

export default ErrorBoundary;
