import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './States';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so a single broken component never blanks the app.
 * Keeps the error visible (and copyable) instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <ErrorState
            title={this.props.fallbackTitle ?? 'This view crashed'}
            description={this.state.error.message}
            onRetry={() => this.setState({ error: null })}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
