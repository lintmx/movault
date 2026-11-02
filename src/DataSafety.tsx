import { useEffect, useState } from 'react'
import { Sheet } from './ui'

export function DataSafety({ onClose, notify }: {
  onClose: () => void
  notify: (message: string) => void
}) {
  const agent = navigator.userAgent
  const ipad = /iPad/.test(agent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const ios = ipad || /iPhone|iPod/.test(agent)
  const android = /Android/.test(agent)
  const mac = !ios && /Mac/.test(navigator.platform)
  const windows = /Win/.test(navigator.platform)
  const device = ipad ? 'iPad' : /iPhone/.test(agent) ? 'iPhone' : /iPod/.test(agent) ? 'iPod'
    : android ? 'Android' : mac ? 'macOS' : windows ? 'Windows'
      : /Linux/.test(navigator.platform) ? 'Linux' : '当前设备'
  const embedded = /MicroMessenger|QQ\/|Weibo|FBAN|FBAV|Instagram|Line\/|;\s*wv\b/i.test(agent)
  const browser = /MicroMessenger/i.test(agent) ? '微信内置浏览器' : /QQ\//.test(agent) ? 'QQ 内置浏览器'
    : embedded ? '应用内浏览器' : /Edg/.test(agent) ? 'Edge' : /Firefox|FxiOS/.test(agent) ? 'Firefox'
      : /OPR|OPiOS/.test(agent) ? 'Opera' : /SamsungBrowser/.test(agent) ? 'Samsung Internet'
        : /Chrome|CriOS/.test(agent) ? 'Chrome' : /Chromium/.test(agent) ? 'Chromium'
          : /Version\/[\d.]+.*Safari/.test(agent) ? 'Safari' : '当前浏览器'
  const safari = browser === 'Safari'
  const firefox = !ios && browser === 'Firefox'
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  const itp = !embedded && (ios || safari)
  let retention = '空间不足时，浏览器可能回收本站数据。申请持久存储可减少这类风险，但仍需保留文件备份。'
  if (embedded) {
    retention = '数据保留由当前应用及其浏览器内核决定，清理或卸载该应用可能清除数据；此处的数据可能与本机浏览器隔离。'
  } else if (itp) {
    retention = standalone
      ? ios
        ? '当前以主屏幕应用运行，WebKit 对此提供 ITP 的 7 天无交互清理豁免。手动清理或存储回收仍可能导致数据丢失。'
        : '当前以程序坞 Web App 运行，享有 ITP 的 7 天无交互清理豁免。手动清理或存储回收仍可能导致数据丢失。'
      : safari
        ? '累计 7 天浏览器使用期间未与本站交互，ITP 可能清理本站数据。申请持久存储不能豁免这项规则。'
        : '若当前浏览器使用 WebKit，其 ITP 规则可能在累计 7 天浏览器使用期间未与本站交互后清理数据。持久存储授权不能豁免 ITP；实际规则取决于当前浏览器内核。'
  }
  let installTitle = '固定访问入口'
  let installHelp = '请固定使用当前浏览器和网址管理数据。'
  if (embedded) {
    installTitle = '在本机浏览器中打开'
    installHelp = '从当前应用菜单选择「在浏览器中打开」，或复制网址到本机浏览器，再按新入口中的提示设置。'
  } else if (standalone) {
    installTitle = ios || android ? '继续从主屏幕图标打开' : mac && safari ? '继续从程序坞打开' : '继续从应用图标打开'
    installHelp = '请固定使用这个入口。切换到其他入口时，请先导出备份。'
  } else if (ios) {
    installTitle = '添加到主屏幕'
    installHelp = safari
      ? '打开分享菜单，选择「添加到主屏幕」，之后从主屏幕图标进入。'
      : '打开当前浏览器的分享菜单，若提供「添加到主屏幕」，选择后从主屏幕图标进入。'
  } else if (android) {
    installTitle = '添加到主屏幕'
    installHelp = firefox
      ? '打开 Firefox 三点菜单，点击「安装」，在添加到主屏幕的面板中确认。'
      : browser === 'Chrome'
        ? '打开 Chrome 三点菜单，选择「添加到主屏幕」或「安装应用」，按提示确认。'
        : '打开当前浏览器菜单，若提供「安装应用」或「添加到主屏幕」，按提示确认。'
  } else if (mac && safari) {
    installTitle = '添加到程序坞'
    installHelp = '若「文件」菜单提供「添加到程序坞」，选择后从程序坞图标打开。此功能需要 macOS Sonoma 14 或更新系统。'
  } else if (firefox && windows && Number(agent.match(/Firefox\/(\d+)/)?.[1]) >= 143) {
    installTitle = '安装为应用'
    installHelp = '若 Firefox 地址栏显示 Web App 按钮，点击安装，并按提示固定到任务栏。'
  } else if (['Chrome', 'Chromium', 'Edge'].includes(browser)) {
    installTitle = '安装为应用'
    installHelp = `使用 ${browser} 地址栏或菜单中的安装入口，将 Movault 安装为应用；是否显示该入口以当前浏览器为准。`
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
          ? '已获存储回收保护，仍需导出备份；此授权不能豁免 ITP 清理。'
          : '已获存储回收保护，仍需导出备份。'
        : '浏览器未授予存储保护，仍可正常使用，请及时导出备份。')
    } catch {
      notify('无法申请存储保护，请使用 HTTPS 和普通浏览模式，并保留文件备份。')
    } finally {
      setRequesting(false)
      onClose()
    }
  }

  return (
    <Sheet title="先了解数据如何保留" description="数据仅保存在当前浏览器，没有云端副本。"
      onClose={() => { if (!requesting) onClose() }}>
      <div className="safety-content">
        <section>
          <h3>{device} · {standalone && ios ? '主屏幕应用' : browser}</h3>
          <p>{retention}</p>
        </section>
        <section>
          <h3>{installTitle}</h3>
          <p>{installHelp}</p>
          {!standalone && installTitle !== '固定访问入口' && <p>已有数据请先导出；新入口中若没有数据，再导入备份。</p>}
        </section>
        <section>
          <h3>把备份保存到本机</h3>
          <p>{ios
            ? `在「数据管理」导出 JSON，分享时选择「存储到文件」→「在我的 ${device}」。若直接下载，请在「文件」中确认已保存到本机。`
            : android
              ? '在「数据管理」导出 JSON，选择本机内部存储的文件夹；若直接下载，请在文件管理器的下载目录中确认。'
              : '在「数据管理」导出 JSON，保存到本机文件夹，并在浏览器下载列表中确认文件。'}无需选择云盘。</p>
          <p>无痕模式、清除网站数据或卸载浏览器都可能丢失数据；离线使用和存储保护都不能替代文件备份。</p>
        </section>
        <p className="hint" role="status">{persistent ? '当前已获存储回收保护，仍需备份。'
          : !supported ? '当前环境不支持存储保护申请，请通过文件备份保留数据。'
            : firefox ? '申请存储保护时，Firefox 可能弹出授权窗口。'
              : '存储保护由浏览器决定是否授予，不保证申请成功。'}</p>
      </div>
      <div className="sheet-footer">
        {supported && !persistent && <button className="button secondary" disabled={requesting} onClick={onClose}>暂不申请</button>}
        <button className="button primary" disabled={requesting}
          onClick={supported && !persistent ? protect : onClose}>
          {requesting ? '正在申请…' : supported && !persistent ? '申请保护并继续' : '知道了'}
        </button>
      </div>
    </Sheet>
  )
}
