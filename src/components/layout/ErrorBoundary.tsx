import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Nieznany błąd interfejsu użytkownika.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('FinPulse UI ErrorBoundary:', error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ hasError: false, errorMessage: '' });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
        <div className="glass-card w-full p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/40 bg-rose-500/15 text-rose-300">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-bold text-white">
            Wystąpił nieoczekiwany błąd widoku
          </h1>
          <p className="mt-2 text-sm text-[var(--ink-secondary)]">
            Twoje dane finansowe pozostają lokalnie w przeglądarce. Odśwież aplikację, aby przywrócić sesję roboczą.
          </p>
          <pre className="font-mono-num mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-3 text-left text-xs text-rose-200">
            {this.state.errorMessage}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-sky-400/50 bg-sky-500/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-500/30 sm:text-sm"
          >
            <RotateCcw className="h-4 w-4" />
            Odśwież aplikację
          </button>
        </div>
      </div>
    );
  }
}
