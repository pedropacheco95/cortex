/**
 * Atomic tests — `store.layout` (schema Part II S1–S3, S6), one per
 * acceptance criterion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { loadStore } from '../../../src/store/layout.js';
import { parseNowItems } from '../../../src/store/frontmatter.js';
import { storeInit } from '../../../src/store/init.js';
import { tmpRepo, cleanRepos, writeStoreFile, writeConfig, baseFm, snapshot } from '../../fixtures/store.js';

afterEach(cleanRepos);

describe('store.layout', () => {
  it('classifies files by module and folder', () => {
    const root = tmpRepo('classify');
    writeConfig(root);
    writeStoreFile(root, 'code/hooks/pre-read.md', baseFm());
    writeStoreFile(root, 'world/terms/fare.md', baseFm());
    writeStoreFile(root, 'history/incidents/2026-09-01-x.md', baseFm());
    const store = loadStore(root);
    const byPath = Object.fromEntries(store.files.map((f) => [f.path, f]));
    expect(byPath['code/hooks/pre-read.md']).toMatchObject({ module: 'code', folder: 'code/hooks' });
    expect(byPath['world/terms/fare.md']).toMatchObject({ module: 'world', folder: 'world/terms' });
    expect(byPath['history/incidents/2026-09-01-x.md']).toMatchObject({ module: 'history', folder: 'history/incidents' });
  });

  it('loads a file without frontmatter as frontmatter: null', () => {
    const root = tmpRepo('nofm');
    writeConfig(root);
    writeStoreFile(root, 'world/people/rui.md', null, 'Rui runs ops.\n');
    const f = loadStore(root).files.find((x) => x.path === 'world/people/rui.md')!;
    expect(f.frontmatter).toBeNull();
  });

  it('parses origin as a string or a list, and reports a malformed one', () => {
    const root = tmpRepo('origin');
    writeConfig(root);
    fs.mkdirSync(path.join(root, 'cortex/world/terms'), { recursive: true });
    fs.writeFileSync(path.join(root, 'cortex/world/terms/a.md'),
      '---\nabout: A\npermanence: stable\nverified: 2026-10-12 (told)\norigin: session:3f2a9c1e-7b4d-4e8a-9f60-2c1d5e8b7a94\n---\nA\n');
    fs.writeFileSync(path.join(root, 'cortex/world/terms/b.md'),
      '---\nabout: B\npermanence: stable\nverified: 2026-10-12 (told)\norigin: [migrated:compass/preferences.md#1@d7ed910, migrated:compass/preferences.md#3@d7ed910]\n---\nB\n');
    fs.writeFileSync(path.join(root, 'cortex/world/terms/c.md'),
      '---\nabout: C\npermanence: stable\nverified: 2026-10-12 (told)\norigin: somewhere\n---\nC\n');
    const files = Object.fromEntries(loadStore(root).files.map((f) => [f.path, f]));
    expect(files['world/terms/a.md']!.origin).toEqual({ values: [{ form: 'session', ref: '3f2a9c1e-7b4d-4e8a-9f60-2c1d5e8b7a94' }] });
    expect(files['world/terms/b.md']!.origin).toEqual({
      values: [
        { form: 'migrated', ref: 'compass/preferences.md#1@d7ed910' },
        { form: 'migrated', ref: 'compass/preferences.md#3@d7ed910' },
      ],
    });
    expect(files['world/terms/c.md']!.origin).toHaveProperty('error');
  });

  it('parses verified into a date and a method, and reports a malformed one', () => {
    const root = tmpRepo('verified');
    writeConfig(root);
    writeStoreFile(root, 'world/terms/fare.md', baseFm({ verified: '2026-10-12 (told)' }));
    writeStoreFile(root, 'world/terms/tide.md', baseFm({ verified: 'last week' }));
    const files = Object.fromEntries(loadStore(root).files.map((f) => [f.path, f]));
    expect(files['world/terms/fare.md']!.verified).toEqual({ date: '2026-10-12', method: 'told' });
    expect(files['world/terms/tide.md']!.verified).toHaveProperty('error');
  });

  it('parses now/ items with their until dates', () => {
    const items = parseNowItems('- Rui away until: 2026-10-20\n\n## Release freeze\nuntil: 2026-11-01\nNo deploys.\n');
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.until)).toEqual(['2026-10-20', '2026-11-01']);
  });

  it('store init creates a valid empty store and keeps visibility', () => {
    const root = tmpRepo('init');
    fs.mkdirSync(path.join(root, '.cortex'));
    fs.writeFileSync(path.join(root, '.cortex/cortex.config.json'), JSON.stringify({ schemaVersion: '3.4', visibility: { repo: 'public', allow: [] } }));
    storeInit(root);
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf8'));
    expect(cfg.schemaVersion).toBe('4.0');
    expect(cfg.visibility.repo).toBe('public');
    for (const d of ['code', 'world/people', 'world/orgs', 'world/terms', 'world/systems', 'world/agreements', 'world/decisions', 'world/rules',
      'history/sources', 'history/changes', 'history/incidents', 'history/measurements', 'now']) {
      expect(fs.statSync(path.join(root, 'cortex', d)).isDirectory()).toBe(true);
    }
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toContain('cortex/history/sources/raw/');
  });

  it('store init is idempotent', () => {
    const root = tmpRepo('init2');
    storeInit(root);
    writeStoreFile(root, 'world/terms/fare.md', baseFm());
    const before = snapshot(root);
    storeInit(root);
    expect(snapshot(root)).toEqual(before);
  });
});
