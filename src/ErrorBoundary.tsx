import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught application error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let parsedError: Record<string, unknown> | null = null;
      try {
        parsedError = JSON.parse(this.state.errorMessage);
      } catch {
        parsedError = null;
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-900">
                  Database Security or Runtime Exception
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  The operation was halted by client or Firestore security validation.
                </p>
                {parsedError ? (
                  <pre className="mt-4 p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono-tabular overflow-x-auto">
                    {JSON.stringify(parsedError, null, 2)}
                  </pre>
                ) : (
                  <p className="mt-3 p-3 bg-red-50 text-red-800 rounded-lg text-xs font-mono-tabular break-all">
                    {this.state.errorMessage}
                  </p>
                )}
                <div className="mt-4">
                  <button
                    onClick={() => {
                      this.setState({ hasError: false, errorMessage: '' });
                      window.location.reload();
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reload Workspace
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
