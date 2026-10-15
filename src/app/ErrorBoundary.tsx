import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n';
import { href } from './router';

interface Props {
  children: ReactNode;
  /** Show a link back to the home screen (not when the error is on the home screen itself). */
  showHome?: boolean;
}

interface State {
  error: Error | null;
  componentStack?: string;
}

/**
 * Without a boundary, one render error unmounts the whole app and leaves an empty (black in dark
 * mode) screen. This shows the error instead, so it can be reported, and keeps the navigation usable.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? undefined });
    console.error(error, info.componentStack);
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    const details = [
      `${error.name}: ${error.message}`,
      `ToFoo ${__APP_VERSION__} · ${navigator.userAgent}`,
      (error.stack ?? '').split('\n').slice(0, 8).join('\n'),
      (componentStack ?? '').trim().split('\n').slice(0, 8).join('\n'),
    ].join('\n\n');
    return (
      <div className="error-screen" role="alert">
        <h1>{t('error.title')}</h1>
        <p>{t('error.body')}</p>
        <div className="row wrap">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            {t('error.reload')}
          </button>
          {this.props.showHome && (
            <a className="btn btn-secondary" href={href()}>
              {t('error.home')}
            </a>
          )}
          <button className="btn btn-ghost" onClick={() => void navigator.clipboard?.writeText(details).catch(() => undefined)}>
            {t('error.copy')}
          </button>
        </div>
        <pre className="error-details small">{details}</pre>
      </div>
    );
  }
}
