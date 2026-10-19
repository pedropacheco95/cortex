/** A validator finding (schema Part II S11; spec store.validate Rule 1). */
export type FindingLevel = 'error' | 'warning';

export interface Finding {
  level: FindingLevel;
  check: string;
  /** Store-relative path, or a folder, or `cortex.json`. */
  path: string;
  message: string;
}

export interface CheckOptions {
  /** `YYYY-MM-DD`; the local date when absent (store.freshness Rule 4). */
  today: string;
}

export function localToday(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function finding(level: FindingLevel, check: string, path: string, message: string): Finding {
  return { level, check, path, message };
}
