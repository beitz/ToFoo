import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installDiagnostics } from './app/diagnostics';
import { watchStaleBuild } from './app/staleBuild';
import { startUpdates } from './app/update';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { startLanguage } from './app/language';

startLanguage();
installDiagnostics();
watchStaleBuild();
startUpdates(registerSW);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
