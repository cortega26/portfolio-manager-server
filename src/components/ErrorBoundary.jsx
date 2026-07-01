import React from 'react';

/**
 * @typedef {{ children: React.ReactNode }} ErrorBoundaryProps
 * @typedef {{ hasError: boolean }} ErrorBoundaryState
 */

/**
 * Top-level error boundary that catches render crashes and shows a fallback
 * UI with a reload button instead of leaving the user with a blank screen.
 *
 * This is intentionally a class component (React requires class components
 * for error boundaries — there is no hook equivalent).
 *
 * The fallback uses hardcoded English text rather than the app's i18n
 * provider because the i18n context itself may have caused the crash.
 */
export default class ErrorBoundary extends React.Component {
  /** @param {ErrorBoundaryProps} props */
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  /** @param {Error} error @param {React.ErrorInfo} info */
  componentDidCatch(error, info) {
    // Surface the crash to the console for diagnosis; no remote reporting.
    console.error('Unhandled render error', error, info?.componentStack);
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 p-8 text-center text-slate-100"
        >
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-sm text-slate-300">
            The app hit an unexpected error. Reloading usually fixes it. If it keeps happening, your
            data is safe — it is stored locally.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
