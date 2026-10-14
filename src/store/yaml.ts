/**
 * A small, deterministic YAML frontmatter writer for the files Core creates
 * (expiry records, migrated files). Scalars are left plain when YAML reads
 * them back as the same string, and JSON-quoted otherwise; lists are block
 * style; objects are flow style.
 */

const PLAIN = /^[A-Za-z0-9_./][A-Za-z0-9 _./()'@+,:#-]*$/;
const RESERVED = /^(?:true|false|yes|no|on|off|null|~|-?\d+(?:\.\d+)?|\d{4}-\d{2}-\d{2}(?:[Tt ].*)?)$/i;

export function yamlScalar(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v === null || v === undefined) return 'null';
  const s = String(v);
  if (s !== '' && PLAIN.test(s) && !RESERVED.test(s) && !/\s$/.test(s) && !s.includes(': ') && !s.includes(' #') && !s.endsWith(':')) return s;
  return JSON.stringify(s);
}

function flow(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(flow).join(', ')}]`;
  if (v !== null && typeof v === 'object') return `{ ${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${flow(x)}`).join(', ')} }`;
  if (typeof v === 'string' && /[,\[\]{}]/.test(v)) return JSON.stringify(v);
  return yamlScalar(v);
}

export function frontmatterText(fm: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) lines.push(`${k}: []`);
      else {
        lines.push(`${k}:`);
        for (const x of v) lines.push(`  - ${typeof x === 'object' && x !== null ? flow(x) : yamlScalar(x)}`);
      }
    } else if (v !== null && typeof v === 'object') lines.push(`${k}: ${flow(v)}`);
    else lines.push(`${k}: ${yamlScalar(v)}`);
  }
  lines.push('---');
  return lines.join('\n') + '\n';
}
