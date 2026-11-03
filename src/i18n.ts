import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhHans from './locales/zh-Hans.json'
import zhHant from './locales/zh-Hant.json'
import ja from './locales/ja.json'

export type Locale = 'en' | 'zh-Hans' | 'zh-Hant' | 'ja'
export type Message = string | { key: string; values: Record<string, string | number> }

export function resolveLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    try {
      const locale = new Intl.Locale(language)
      if (locale.language === 'en' || locale.language === 'ja') return locale.language
      if (locale.language === 'zh') {
        if (locale.script === 'Hant') return 'zh-Hant'
        if (locale.script === 'Hans') return 'zh-Hans'
        if (locale.script) continue
        return ['TW', 'HK', 'MO'].includes(locale.region ?? '') ? 'zh-Hant' : 'zh-Hans'
      }
    } catch { /* Skip malformed browser language tags. */ }
  }
  return 'en'
}

function browserLocale() {
  return resolveLocale(navigator.languages?.length ? navigator.languages : [navigator.language])
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-Hans': { translation: zhHans },
    'zh-Hant': { translation: zhHant },
    ja: { translation: ja },
  },
  lng: browserLocale(),
  supportedLngs: ['en', 'zh-Hans', 'zh-Hant', 'ja'],
  fallbackLng: 'en',
  load: 'currentOnly',
  keySeparator: false,
  initAsync: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
})

function updateDocument() {
  document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
  document.title = i18n.t('common.pageTitle')
  document.querySelector('meta[name="description"]')?.setAttribute('content', i18n.t('common.pageDescription'))
}

updateDocument()
i18n.on('languageChanged', updateDocument)
window.addEventListener('languagechange', () => { void i18n.changeLanguage(browserLocale()) })

export function translateMessage(message: Message | undefined): string {
  if (!message) return ''
  return typeof message === 'string'
    ? i18n.t(message, { defaultValue: i18n.t('common.unexpectedError') })
    : i18n.t(message.key, message.values)
}

export function formatDate(date: string) {
  if (!date) return i18n.t('movies.noReleaseDate')
  return new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function yen(amount: number) {
  return new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: 'currency', currency: 'JPY', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

export function formatDateTime(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'medium', timeStyle: 'medium', hour12: false, timeZone,
  }).format(date)
}

export default i18n
