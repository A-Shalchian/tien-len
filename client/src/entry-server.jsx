import { StrictMode } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import App from './App.jsx';
import { LanguageProvider } from './i18n/index.jsx';

export async function render(pathname) {
  const { prelude } = await prerenderToNodeStream(
    <StrictMode>
      <LanguageProvider pathname={pathname}>
        <App pathname={pathname} />
      </LanguageProvider>
    </StrictMode>,
    { progressiveChunkSize: Number.POSITIVE_INFINITY },
  );
  let html = '';
  for await (const chunk of prelude) html += chunk;
  return html;
}
