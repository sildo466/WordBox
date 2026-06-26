import { zhCN, type ZhCNKey } from './zh-CN'
import { enUS } from './en-US'

export type Locale = 'zh-CN' | 'en-US'

const locales: Record<Locale, Record<string, string>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

let currentLocale: Locale = 'zh-CN'

export function setLocale(locale: Locale) {
  currentLocale = locale
}

export function getLocale(): Locale {
  return currentLocale
}

/**
 * Get a translated string by key.
 * Supports interpolation: t('tick.label', { n: 5 }) → '第5轮'
 */
export function t(key: ZhCNKey | string, params?: Record<string, string | number>): string {
  const dict = locales[currentLocale] ?? zhCN
  let value = dict[key] ?? zhCN[key as ZhCNKey] ?? key

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, String(v))
    }
  }

  return value
}
