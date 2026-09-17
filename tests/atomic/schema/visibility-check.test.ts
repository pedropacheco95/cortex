/**
 * Atomic tests — check.visibility (schema §10.1, Appendix A; spec
 * schema.visibility Rules 2–7; RULES.md rule 20). The five regex families are
 * pinned as exported constants; the check runs only when visibility.repo is
 * "public", is gitignore-aware without spawning git, caps at 20 lines per
 * file, and never emits an error.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  checkVisibility,
  VISIBILITY_PATTERNS,
  VISIBILITY_CONTEXT_WORDS,
  VISIBILITY_SAFE_HOSTS,
  VISIBILITY_MAX_LINES_PER_FILE,
  VISIBILITY_CODE_REFERENCE_EXTENSIONS,
} from '../../../src/schema/checks/visibility.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function project(label: string, visibility: Record<string, unknown> | undefined): string {
  const root = makeTmpDir(`visibility-${label}`);
  dirs.push(root);
  makeCortexProject(root, {
    config: { schemaVersion: '3.4', loop: { enabled: false }, ...(visibility === undefined ? {} : { visibility }) },
  });
  return root;
}

function write(root: string, rel: string, content: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
  return abs;
}

const ENVIRONMENT_LINES = [
  '# Environment',
  '',
  'Notes about where things run.',
  '',
  'VM: 10.20.30.40',
  'Host: app-prod.internal.acme.cloud (ssh)',
  'API at api.acme.com:8443',
  'ssh deploy@app-prod.internal.acme.cloud',
  'Account 123456789012',
].join('\n') + '\n';

describe('check.visibility: pinned constants (Rule 4)', () => {
  it('VISIBILITY_PATTERNS carries exactly the five families in order', () => {
    expect(VISIBILITY_PATTERNS.map((p) => p.name)).toEqual(['ipv4', 'host', 'port', 'ssh', 'account']);
    for (const p of VISIBILITY_PATTERNS) expect(p.regex).toBeInstanceOf(RegExp);
  });

  it('the ipv4, host, port and ssh regexes are the pinned sources', () => {
    const byName = Object.fromEntries(VISIBILITY_PATTERNS.map((p) => [p.name, p.regex]));
    expect(byName['ipv4']!.source).toBe(String.raw`\b(?:\d{1,3}\.){3}\d{1,3}\b`);
    expect(byName['host']!.source).toBe(String.raw`\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+\.(?:com|net|org|io|dev|cloud|app|run|internal|local|corp|lan)\b`);
    expect(byName['host']!.flags).toContain('i');
    expect(byName['port']!.source).toBe(String.raw`\b(?:(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9.-]+\.[a-z]{2,}):\d{2,5}\b`);
    expect(byName['port']!.flags).toContain('i');
    expect(byName['ssh']!.source).toBe(String.raw`\bssh\s+(?:-\S+\s+)*[A-Za-z0-9._-]+@[A-Za-z0-9.-]+`);
  });

  it('the account family matches each of its five pinned shapes', () => {
    const account = VISIBILITY_PATTERNS.find((p) => p.name === 'account')!.regex;
    for (const s of [
      'account 123456789012',
      'role arn:aws:iam::123:role/x',
      'sa deploy-bot@my-proj-1234.iam.gserviceaccount.com',
      'gcloud --project acme-prod-01 compute',
      'gcloud --project=acme-prod-01 compute',
      'path projects/acme-prod-01/zones',
    ]) {
      account.lastIndex = 0;
      expect(account.test(s), s).toBe(true);
    }
    for (const s of ['account 12345678901', 'account 1234567890123', 'version 1.2.3']) {
      account.lastIndex = 0;
      expect(account.test(s), s).toBe(false);
    }
  });

  it('context words, safe hosts and the per-file cap are pinned', () => {
    expect(VISIBILITY_CONTEXT_WORDS).toEqual([
      'ssh', 'host', 'hostname', 'server', 'vm', 'instance', 'cluster', 'endpoint', 'url', 'database', 'db', 'port', 'ip', 'address',
    ]);
    expect(VISIBILITY_SAFE_HOSTS).toEqual([
      'github.com', 'gitlab.com', 'npmjs.com', 'example.com', 'example.org', 'localhost', 'anthropic.com', 'claude.ai',
    ]);
    expect(VISIBILITY_MAX_LINES_PER_FILE).toBe(20);
    expect(VISIBILITY_CODE_REFERENCE_EXTENSIONS).toEqual(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.yaml', '.yml', '.py', '.sh']);
  });
});

describe('check.visibility: silent unless the repo is declared public (Rule 3)', () => {
  it('visibility absent, repo unknown, repo private → no violation even with an ssh target in compass', () => {
    for (const [label, vis] of [
      ['absent', undefined],
      ['unknown', { repo: 'unknown' }],
      ['private', { repo: 'private' }],
    ] as const) {
      const root = project(label, vis as Record<string, unknown> | undefined);
      write(root, '.cortex/compass/environment.md', '# Env\n\nssh deploy@10.20.30.40\n');
      expect(checkVisibility(root), label).toEqual([]);
    }
  });

  it('a public repo with a clean tree → no violation', () => {
    const root = project('clean', { repo: 'public' });
    write(root, '.cortex/compass/environment.md', '# Env\n\nNothing operational here.\n');
    expect(checkVisibility(root)).toEqual([]);
  });

  it('an unreadable config → silent (no throw, no violation)', () => {
    const root = project('badjson', undefined);
    fs.writeFileSync(path.join(root, '.cortex', 'cortex.config.json'), '{not json', 'utf-8');
    expect(checkVisibility(root)).toEqual([]);
  });
});

describe('check.visibility: a public repo warns with the line, per family (Rules 4–6)', () => {
  it('five lines, five warnings, one family each, all warnings, message per Rule 5', () => {
    const root = project('families', { repo: 'public' });
    const file = write(root, '.cortex/compass/environment.md', ENVIRONMENT_LINES);
    const out = checkVisibility(root);
    expect(out).toHaveLength(5);
    expect(out.map((v) => v.location.line)).toEqual([5, 6, 7, 8, 9]);
    const families = out.map((v) => /carries a (\w+) \(/.exec(v.message)?.[1]);
    expect(families).toEqual(['ipv4', 'host', 'port', 'ssh', 'account']);
    for (const v of out) {
      expect(v.severity).toBe('warning');
      expect(v.check).toBe('check.visibility');
      expect(v.clause).toBe('§10.1');
      expect(v.location.path).toBe(file);
      expect(v.message.startsWith('visibility: repo is public and ')).toBe(true);
      expect(v.message).toContain(`.cortex/compass/environment.md:${v.location.line} carries a `);
      expect(v.message.endsWith(' — move it to an untracked note or add the file to visibility.allow')).toBe(true);
    }
    expect(out[0]?.message).toContain('(10.20.30.40)');
    expect(out[3]?.message).toContain('(ssh deploy@app-prod.internal.acme.cloud)');
  });

  it('a line matching two families yields ONE warning, naming the most specific family (ssh > account > port > ipv4 > host)', () => {
    const root = project('multi', { repo: 'public' });
    write(root, '.cortex/compass/environment.md', 'ssh root@10.20.30.40\nHost: app.acme.io (ssh)\n');
    const out = checkVisibility(root);
    expect(out).toHaveLength(2);
    expect(out[0]?.message).toContain('carries a ssh');
    expect(out[1]?.message).toContain('carries a host'); // no user@host on the line: host, not ssh
  });

  it('the matched text is cut to 40 characters', () => {
    const root = project('cut', { repo: 'public' });
    write(root, '.cortex/compass/environment.md', 'ssh deploy@some-very-long-hostname-that-keeps-on-going.internal.acme.cloud\n');
    const out = checkVisibility(root);
    expect(out).toHaveLength(1);
    const shown = /\((.*)\) — move it/.exec(out[0]!.message)?.[1] ?? '';
    expect(shown.length).toBeLessThanOrEqual(40);
    expect(shown.startsWith('ssh deploy@some-very-long')).toBe(true);
  });

  it('frontmatter and fenced code blocks are scanned like body text', () => {
    const root = project('fence', { repo: 'public' });
    write(root, '.cortex/atlas/decisions/2026-01-01-x.md', '---\nhost: db.acme.net\n---\n\n```sh\nssh ops@db.acme.net\n```\n');
    const out = checkVisibility(root);
    expect(out.map((v) => v.location.line)).toEqual([2, 6]);
  });

  it('.yaml files are scanned; other extensions are not', () => {
    const root = project('ext', { repo: 'public' });
    write(root, '.cortex/atlas/stakeholders/people.yaml', 'vm: 10.20.30.40\n');
    write(root, '.cortex/atlas/sources/dump.txt', 'vm: 10.20.30.41\n');
    write(root, '.cortex/compass/notes.json', '{"vm": "10.20.30.42"}\n');
    const out = checkVisibility(root);
    expect(out).toHaveLength(1);
    expect(out[0]?.location.path.endsWith('people.yaml')).toBe(true);
  });

  it('insight/, archive/ and pulse/ are never scanned', () => {
    const root = project('scope', { repo: 'public' });
    write(root, '.cortex/insight/anatomy/x.md', 'ssh ops@db.acme.net\n');
    write(root, '.cortex/archive/documents/a/extracted/claims.md', 'ssh ops@db.acme.net\n');
    write(root, '.cortex/pulse/reports/x.md', 'ssh ops@db.acme.net\n');
    expect(checkVisibility(root)).toEqual([]);
  });

  it('two runs over the same tree emit identical warnings, in sorted path order', () => {
    const root = project('stable', { repo: 'public' });
    write(root, '.cortex/compass/z.md', 'vm 10.0.0.2\n');
    write(root, '.cortex/atlas/a.md', 'vm 10.0.0.1\n');
    write(root, '.cortex/compass/b.md', 'vm 10.0.0.3\nvm 10.0.0.4\n');
    const first = checkVisibility(root);
    const second = checkVisibility(root);
    expect(second).toEqual(first);
    expect(first.map((v) => path.relative(root, v.location.path))).toEqual([
      '.cortex/atlas/a.md', '.cortex/compass/b.md', '.cortex/compass/b.md', '.cortex/compass/z.md',
    ]);
    expect(first.map((v) => v.location.line)).toEqual([1, 1, 2, 1]);
    expect(first.every((v) => v.severity === 'warning')).toBe(true);
  });
});

describe('check.visibility: safe hosts and dev ports never match (Rule 4 exclusions)', () => {
  it('the four pinned safe lines emit nothing', () => {
    const root = project('safe', { repo: 'public' });
    write(root, '.cortex/compass/environment.md', [
      'GitHub remote: github.com/acme/app (private)',
      'Dev server: localhost:3000',
      'Version 3.4.0.1 shipped',
      'Bind 0.0.0.0',
    ].join('\n') + '\n');
    expect(checkVisibility(root)).toEqual([]);
  });

  it('ipv4 exclusions: 127.0.0.1, a v-prefixed version, a dash-suffixed version', () => {
    const root = project('ipv4-excl', { repo: 'public' });
    write(root, '.cortex/compass/environment.md', 'loopback 127.0.0.1\nrelease v1.2.3.4\nbuild 1.2.3.4-rc1\nVersion: 3.4.0.1\nvm 10.0.0.1 and 127.0.0.1\n');
    const out = checkVisibility(root);
    expect(out.map((v) => v.location.line)).toEqual([5]); // the second address on line 5 is real
    expect(out[0]?.message).toContain('(10.0.0.1)');
  });

  it('a hostname on a line WITHOUT a context word does not match; with one, or after @ or ://, it does', () => {
    const root = project('host-ctx', { repo: 'public' });
    write(root, '.cortex/compass/environment.md', [
      'See the docs at docs.acme.io for details',       // 1: no context word → silent
      'Server: app.acme.io',                             // 2: context word
      'reach it at https://app.acme.io/health',          // 3: preceded by ://
      'mail ops@corp.acme.io when it fails',             // 4: preceded by @
      'The DATABASE lives on db.acme.internal',          // 5: context word, case-insensitive
    ].join('\n') + '\n');
    expect(checkVisibility(root).map((v) => v.location.line)).toEqual([2, 3, 4, 5]);
  });

  it('safe hosts never match even with a context word or a scheme', () => {
    const root = project('safe-hosts', { repo: 'public' });
    write(root, '.cortex/compass/environment.md', [
      'server: github.com/acme/app',
      'url https://gitlab.com/acme',
      'registry host npmjs.com',
      'host example.com and example.org',
      'endpoint https://claude.ai and anthropic.com',
      'localhost is the server',
      'server api.github.com and registry.npmjs.com and www.example.com',
    ].join('\n') + '\n');
    expect(checkVisibility(root)).toEqual([]);
  });

  it('port: localhost:PORT and schema:§ never match; host:port and ip:port do', () => {
    const root = project('port', { repo: 'public' });
    write(root, '.cortex/compass/environment.md', 'localhost:8080\nsee schema:§10\napi.acme.com:443\n10.20.30.40:22\n');
    const out = checkVisibility(root);
    expect(out.map((v) => v.location.line)).toEqual([3, 4]);
    expect(out[0]?.message).toContain('carries a port');
    expect(out[1]?.message).toContain('carries a port'); // port is more specific than the bare ipv4 on the same line
  });

  it('a code reference (file.ext:line) is not a port; a real host:port on the same file still is', () => {
    const root = project('code-ref', { repo: 'public' });
    write(root, '.cortex/compass/bugs/B-099-x.md', [
      'Evidence: src/hooks/post-read.ts:74 and layout.ts:60',
      'B-019 … the check at validate.ts:119',
      'See tests/x.test.tsx:12, build.mjs:3, cfg.cjs:9, package.json:5, README.md:2, a.yaml:1, b.yml:4, run.py:88, go.sh:10',
      'Reach app-prod.internal.acme.cloud:8443',
    ].join('\n') + '\n');
    const out = checkVisibility(root);
    expect(out.map((v) => v.location.line)).toEqual([4]);
    expect(out[0]?.message).toContain('carries a port (app-prod.internal.acme.cloud:8443)');
  });
});

describe('check.visibility: ignored files are out of scope, re-included ones are in (Rule 2)', () => {
  it('root .gitignore excludes atlas/sources/*; a negated pattern re-includes one file', () => {
    const root = project('gitignore', { repo: 'public' });
    fs.writeFileSync(path.join(root, '.gitignore'), '.cortex/atlas/sources/*\n!.cortex/atlas/sources/reframe.md\n', 'utf-8');
    write(root, '.cortex/atlas/sources/notes.md', 'ssh ops@db.acme.net\n');
    write(root, '.cortex/atlas/sources/reframe.md', 'ssh ops@db.acme.net\n');
    const out = checkVisibility(root);
    expect(out).toHaveLength(1);
    expect(out[0]?.location.path.endsWith('reframe.md')).toBe(true);
  });

  it('.cortex/.gitignore is honoured too (patterns relative to .cortex/)', () => {
    const root = project('nested-gitignore', { repo: 'public' });
    fs.writeFileSync(path.join(root, '.cortex', '.gitignore'), 'compass/scratch.md\n', 'utf-8');
    write(root, '.cortex/compass/scratch.md', 'ssh ops@db.acme.net\n');
    write(root, '.cortex/compass/environment.md', 'ssh ops@db.acme.net\n');
    const out = checkVisibility(root);
    expect(out).toHaveLength(1);
    expect(out[0]?.location.path.endsWith('environment.md')).toBe(true);
  });

  it('no .gitignore at all → everything is tracked', () => {
    const root = project('no-gitignore', { repo: 'public' });
    write(root, '.cortex/atlas/sources/notes.md', 'ssh ops@db.acme.net\n');
    expect(checkVisibility(root)).toHaveLength(1);
  });
});

describe('check.visibility: an allow glob silences a file and is reported (Rule 5)', () => {
  it('an exact-path allow entry skips the file and records a note; other files still warn', () => {
    const root = project('allow', { repo: 'public', allow: ['.cortex/compass/environment.md'] });
    write(root, '.cortex/compass/environment.md', ENVIRONMENT_LINES);
    write(root, '.cortex/compass/other.md', 'vm 10.0.0.9\n');
    const notes: string[] = [];
    const out = checkVisibility(root, notes);
    expect(out).toHaveLength(1);
    expect(out[0]?.location.path.endsWith('other.md')).toBe(true);
    expect(notes).toEqual(['allowed by visibility.allow: .cortex/compass/environment.md']);
  });

  it('a glob allow entry (picomatch) matches by project-relative path', () => {
    const root = project('allow-glob', { repo: 'public', allow: ['.cortex/atlas/**'] });
    write(root, '.cortex/atlas/decisions/x.md', 'vm 10.0.0.9\n');
    write(root, '.cortex/compass/environment.md', 'vm 10.0.0.8\n');
    const notes: string[] = [];
    const out = checkVisibility(root, notes);
    expect(out).toHaveLength(1);
    expect(out[0]?.location.path.endsWith('environment.md')).toBe(true);
    expect(notes).toEqual(['allowed by visibility.allow: .cortex/atlas/decisions/x.md']);
  });

  it('an allowed file with nothing to report still records the note (the skip is unconditional)', () => {
    const root = project('allow-clean', { repo: 'public', allow: ['.cortex/compass/environment.md'] });
    write(root, '.cortex/compass/environment.md', '# Env\n\nclean\n');
    const notes: string[] = [];
    expect(checkVisibility(root, notes)).toEqual([]);
    expect(notes).toEqual(['allowed by visibility.allow: .cortex/compass/environment.md']);
  });
});

describe('check.visibility: the per-file cap holds (Rule 5)', () => {
  it('30 distinct-address lines → 20 line warnings plus one "… and 10 more lines" warning', () => {
    const root = project('cap', { repo: 'public' });
    const lines = Array.from({ length: 30 }, (_, i) => `vm 10.0.${Math.floor(i / 250)}.${(i % 250) + 1}`);
    const file = write(root, '.cortex/compass/inventory.md', lines.join('\n') + '\n');
    const out = checkVisibility(root);
    expect(out).toHaveLength(21);
    expect(out.slice(0, 20).map((v) => v.location.line)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const tail = out[20]!;
    expect(tail.severity).toBe('warning');
    expect(tail.check).toBe('check.visibility');
    expect(tail.location.path).toBe(file);
    expect(tail.message).toBe('… and 10 more lines');
  });

  it('exactly 20 matching lines → 20 warnings and no tail', () => {
    const root = project('cap-exact', { repo: 'public' });
    const lines = Array.from({ length: 20 }, (_, i) => `vm 10.0.0.${i + 1}`);
    write(root, '.cortex/compass/inventory.md', lines.join('\n') + '\n');
    expect(checkVisibility(root)).toHaveLength(20);
  });
});
