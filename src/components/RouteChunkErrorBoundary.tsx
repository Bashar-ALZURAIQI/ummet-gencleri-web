import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';

interface RouteChunkErrorBoundaryProps {
  children: React.ReactNode;
}

interface RouteChunkErrorBoundaryState {
  hasError: boolean;
}

export class RouteChunkErrorBoundaryClass extends React.Component<
  RouteChunkErrorBoundaryProps & { t: (key: string) => string },
  RouteChunkErrorBoundaryState
> {
  constructor(props: RouteChunkErrorBoundaryProps & { t: (key: string) => string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Route chunk failed to load:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] w-full p-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <p className="text-slate-700 mb-6 max-w-md">
            {this.props.t('routeLoadError')}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-slate-900 text-white rounded hover:bg-slate-800 transition-colors"
          >
            {this.props.t('reloadPage')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function RouteChunkErrorBoundary({ children }: RouteChunkErrorBoundaryProps) {
  const { t } = useTranslation('common');
  return <RouteChunkErrorBoundaryClass t={t}>{children}</RouteChunkErrorBoundaryClass>;
}
