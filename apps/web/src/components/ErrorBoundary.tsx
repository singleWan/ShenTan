'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] 渲染错误:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2 className="error-boundary-title">SYSTEM ERROR</h2>
            <p className="error-boundary-message">
              {this.state.error?.message || '发生了未知错误'}
            </p>
            <div className="error-boundary-actions">
              <button onClick={this.handleRetry} className="btn btn-primary">
                RETRY
              </button>
              <button onClick={this.handleGoHome} className="btn btn-secondary">
                HOME
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
