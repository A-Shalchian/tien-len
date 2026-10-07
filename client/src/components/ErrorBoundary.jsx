import { Component } from 'react';
import { useLang } from '../i18n/index.jsx';

function Fallback() {
  const { t } = useLang();
  return (
    <div className="crash" role="alert">
      <h1>{t('Something went wrong on this page.')}</h1>
      <p>{t('Reload to keep playing. Your chips and games are safe.')}</p>
      <button className="crash-btn" onClick={() => window.location.reload()}>{t('Reload')}</button>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Page crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback === undefined ? <Fallback /> : this.props.fallback;
  }
}
