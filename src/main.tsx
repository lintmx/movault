import i18n from './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { prefetchOcrResources } from './ocr'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' }).catch((error) => {
    console.error(i18n.t('common.offlineFailed'), error)
  })
}

function prefetchOcr() { void prefetchOcrResources().catch(() => {}) }
prefetchOcr()
window.addEventListener('online', prefetchOcr)
