import { type Message } from './i18n'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Sheet } from './ui'

export function DataSafety({ onClose, notify }: {
  onClose: () => void
  notify: (message: Message) => void
}) {
  const { t } = useTranslation()
  const agent = navigator.userAgent
  const ipad = /iPad/.test(agent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const ios = ipad || /iPhone|iPod/.test(agent)
  const android = /Android/.test(agent)
  const mac = !ios && /Mac/.test(navigator.platform)
  const windows = /Win/.test(navigator.platform)
  const device = ipad ? 'iPad' : /iPhone/.test(agent) ? 'iPhone' : /iPod/.test(agent) ? 'iPod'
    : android ? 'Android' : mac ? 'macOS' : windows ? 'Windows'
      : /Linux/.test(navigator.platform) ? 'Linux' : t('safety.device')
  const embedded = /MicroMessenger|QQ\/|Weibo|FBAN|FBAV|Instagram|Line\/|;\s*wv\b/i.test(agent)
  const browser = /MicroMessenger/i.test(agent) ? t('safety.wechat') : /QQ\//.test(agent) ? t('safety.qq')
    : embedded ? t('safety.embedded') : /Edg/.test(agent) ? 'Edge' : /Firefox|FxiOS/.test(agent) ? 'Firefox'
      : /OPR|OPiOS/.test(agent) ? 'Opera' : /SamsungBrowser/.test(agent) ? 'Samsung Internet'
        : /Chrome|CriOS/.test(agent) ? 'Chrome' : /Chromium/.test(agent) ? 'Chromium'
          : /Version\/[\d.]+.*Safari/.test(agent) ? 'Safari' : t('safety.browser')
  const safari = browser === 'Safari'
  const firefox = !ios && browser === 'Firefox'
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  const itp = !embedded && (ios || safari)
  let retention = t('safety.retentionDefault')
  if (embedded) {
    retention = t('safety.retentionEmbedded')
  } else if (itp) {
    retention = standalone
      ? ios
        ? t('safety.retentionHomeApp')
        : t('safety.retentionDockApp')
      : safari
        ? t('safety.retentionSafari')
        : t('safety.retentionWebkit')
  }
  let installTitle = t('safety.fixedEntry')
  let installHelp = t('safety.fixedHelp')
  let hasInstallSteps = true
  if (embedded) {
    installTitle = t('safety.openBrowser')
    installHelp = t('safety.openBrowserHelp')
  } else if (standalone) {
    installTitle = ios || android ? t('safety.keepHome') : mac && safari ? t('safety.keepDock') : t('safety.keepApp')
    installHelp = t('safety.keepEntryHelp')
  } else if (ios) {
    installTitle = t('safety.addHome')
    installHelp = safari
      ? t('safety.addHomeSafari')
      : t('safety.addHomeIos')
  } else if (android) {
    installTitle = t('safety.addHome')
    installHelp = firefox
      ? t('safety.addHomeFirefox')
      : browser === 'Chrome'
        ? t('safety.addHomeChrome')
        : t('safety.addHomeAndroid')
  } else if (mac && safari) {
    installTitle = t('safety.addDock')
    installHelp = t('safety.addDockHelp')
  } else if (firefox && windows && Number(agent.match(/Firefox\/(\d+)/)?.[1]) >= 143) {
    installTitle = t('safety.install')
    installHelp = t('safety.installFirefox')
  } else if (['Chrome', 'Chromium', 'Edge'].includes(browser)) {
    installTitle = t('safety.install')
    installHelp = t('safety.installBrowser', { value1: browser })
  } else {
    hasInstallSteps = false
  }
  const [persistent, setPersistent] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const supported = !!navigator.storage?.persist

  useEffect(() => {
    let active = true
    void navigator.storage?.persisted?.().then((value) => {
      if (active) setPersistent(value)
    }).catch(() => {})
    return () => { active = false }
  }, [])

  async function protect() {
    if (requesting) return
    setRequesting(true)
    try {
      const granted = await navigator.storage.persist()
      notify(granted
        ? itp && !standalone
          ? 'safety.protectedItp'
          : 'safety.protected'
        : 'safety.denied')
    } catch {
      notify('safety.protectFailed')
    } finally {
      setRequesting(false)
      onClose()
    }
  }

  return (
    <Sheet title={t('safety.title')} description={t('safety.description')}
      onClose={() => { if (!requesting) onClose() }}>
      <div className="safety-content">
        <section>
          <h3>{device} · {standalone && ios ? t('safety.homeApp') : browser}</h3>
          <p>{retention}</p>
        </section>
        <section>
          <h3>{installTitle}</h3>
          <p>{installHelp}</p>
          {!standalone && hasInstallSteps && <p>{t('safety.switchWarning')}</p>}
        </section>
        <section>
          <h3>{t('safety.localBackup')}</h3>
          <p>{t('safety.noCloud', { value1: ios
            ? t('safety.backupIos', { device })
            : android
              ? t('safety.backupAndroid')
              : t('safety.backupDesktop') })}</p>
          <p>{t('safety.lossWarning')}</p>
        </section>
        <p className="hint" role="status">{persistent ? t('safety.protectedStatus')
          : !supported ? t('safety.unsupported')
            : firefox ? t('safety.firefoxPrompt')
              : t('safety.browserDecides')}</p>
      </div>
      <div className="sheet-footer">
        {supported && !persistent && <button className="button secondary" disabled={requesting} onClick={onClose}>{t('safety.later')}</button>}
        <button className="button primary" disabled={requesting}
          onClick={supported && !persistent ? protect : onClose}>
          {requesting ? t('safety.requesting') : supported && !persistent ? t('safety.protectContinue') : t('common.understood')}
        </button>
      </div>
    </Sheet>
  )
}
