import { es, type MessageKey } from './es';

type Dict = Record<MessageKey, string>;
const dictionaries: Record<string, Dict> = { es };
let current: Dict = es;

export function setLocale(locale: string): void {
  current = dictionaries[locale] ?? es;
}

export function t(key: MessageKey): string {
  return current[key] ?? key;
}
