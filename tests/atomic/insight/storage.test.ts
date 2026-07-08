/**
 * Atomic tests — the v3 insight JSON/YAML storage formats
 * (src/insight/storage.ts; spec insight.storage-format Rules 3–7; schema
 * §4.10.3–§4.10.6): shape parsers, closed enums, node-id grammar, deterministic
 * total-ordered serializers, and the refuse-to-shrink write guard.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  parseGraphV3,
  parseTagsV3,
  parseClustersV3,
  parseLedger,
  parseReverseIndex,
  parseScopeRegistry,
  scopeRegistryAsymmetries,
  serializeGraphV3,
  serializeTagsV3,
  serializeClustersV3,
  serializeLedger,
  serializeReverseIndex,
  orderingIssues,
  writeInsightJson,
  deriveEdgeId,
  isNodeId,
  isConceptOrEdgeId,
  isEdgeType,
  isConfidenceTier,
  isTagKind,
  EDGE_TYPES,
  CONFIDENCE_TIERS,
  TAG_KINDS,
  type InsightGraphV3,
  type TagsFileV3,
  type ClustersFileV3,
  type LedgerFile,
  type ReverseIndexFile,
} from '../../../src/insight/storage.js';

const SHA = 'a1b3c5d7e9f102132435465768798a9bacbdcedfe0f1023344556677889900aa';

const GRAPH: InsightGraphV3 = {
  schemaVersion: '3.0',
  generated: '2026-07-07T14:05:00Z',
  built_at_commit: '9f2c1ab',
  nodes: [
    { id: 'concept:authentication', kind: 'concept', label: 'authentication' },
    { id: 'file:src/auth/session.ts', kind: 'file', label: 'session.ts' },
  ],
  edges: [
    {
      id: 'edge:implements-concept:file:src/auth/session.ts->concept:authentication',
      source: 'file:src/auth/session.ts',
      target: 'concept:authentication',
      edge_type: 'implements-concept',
      confidence: 'stated',
      evidence: 'session.ts explicitly implements the token-issuance half of authentication',
      confirmed_at_commit: '9f2c1ab',
    },
  ],
};

const TAGS: TagsFileV3 = {
  schemaVersion: '3.0',
  generated: '2026-07-07T14:05:00Z',
  built_at_commit: '9f2c1ab',
  vocabulary: [{ tag: 'authentication', kind: 'concern', aliases: ['auth'] }],
  assignments: { 'file:src/auth/session.ts': ['authentication'] },
};

const CLUSTERS: ClustersFileV3 = {
  schemaVersion: '3.0',
  generated: '2026-07-07T14:05:00Z',
  built_at_commit: '9f2c1ab',
  clusters: [
    {
      id: 'cluster:auth-core',
      label: 'Auth core',
      members: ['file:src/auth/session.ts'],
      rationale: 'co-located auth primitives',
      scope: 'global',
    },
  ],
};

// ---------------------------------------------------------------------------
// Node-id grammar (§4.10.6, path-derived — Decision 27)
// ---------------------------------------------------------------------------

describe('node-id grammar', () => {
  it('accepts file:/element:/concept: forms', () => {
    expect(isNodeId('file:src/auth/session.ts')).toBe(true);
    expect(isNodeId('element:src/auth/session.ts#validateToken')).toBe(true);
    expect(isNodeId('concept:authentication')).toBe(true);
  });

  it('rejects the v2 constellation-borrowed grammar and malformed ids', () => {
    expect(isNodeId('spec:insight.cli')).toBe(false);
    expect(isNodeId('anatomy:src/x.ts')).toBe(false);
    expect(isNodeId('file:')).toBe(false);
    expect(isNodeId('element:src/x.ts')).toBe(false); // missing #<name>
    expect(isNodeId('concept:Not A Slug')).toBe(false);
  });

  it('reverse-index members are concept: or edge: ids', () => {
    expect(isConceptOrEdgeId('concept:authentication')).toBe(true);
    expect(isConceptOrEdgeId('edge:auth-billing-01')).toBe(true);
    expect(isConceptOrEdgeId('file:src/x.ts')).toBe(false);
  });

  it('deriveEdgeId is stable over (source, target, edge_type)', () => {
    expect(deriveEdgeId('file:a.ts', 'file:b.ts', 'imports')).toBe('edge:imports:file:a.ts->file:b.ts');
  });
});

// ---------------------------------------------------------------------------
// Closed enums
// ---------------------------------------------------------------------------

describe('closed enums', () => {
  it('edge_type, confidence tiers, and tag kinds match the schema enums', () => {
    expect([...EDGE_TYPES]).toEqual(['imports', 'calls', 'semantically-similar-to', 'implements-concept', 'co-clustered']);
    expect([...CONFIDENCE_TIERS]).toEqual(['structural', 'stated', 'inferred', 'ambiguous']);
    expect([...TAG_KINDS]).toEqual(['concern', 'technology', 'pattern', 'layer', 'domain-term']);
    for (const e of EDGE_TYPES) expect(isEdgeType(e)).toBe(true);
    for (const c of CONFIDENCE_TIERS) expect(isConfidenceTier(c)).toBe(true);
    for (const k of TAG_KINDS) expect(isTagKind(k)).toBe(true);
    expect(isEdgeType('related-to')).toBe(false);
    expect(isConfidenceTier('high')).toBe(false); // the v2 enum is gone
    expect(isConfidenceTier(0.85)).toBe(false); // never a float
    expect(isTagKind('vibe')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseGraphV3 (AC: well-formed trio conforms; malformed values rejected)
// ---------------------------------------------------------------------------

describe('parseGraphV3', () => {
  it('accepts a well-formed graph (object and string form)', () => {
    expect(parseGraphV3(GRAPH).ok).toBe(true);
    expect(parseGraphV3(JSON.stringify(GRAPH)).ok).toBe(true);
  });

  it('AC: an edge with empty evidence is an error', () => {
    const bad = { ...GRAPH, edges: [{ ...GRAPH.edges[0]!, evidence: '   ' }] };
    const result = parseGraphV3(bad);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('evidence');
  });

  it('AC: edge_type outside the closed enum is rejected', () => {
    const bad = { ...GRAPH, edges: [{ ...GRAPH.edges[0]!, edge_type: 'related-to' }] };
    const result = parseGraphV3(bad);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('edge_type');
  });

  it('AC: a float confidence is rejected — tiers only', () => {
    const bad = { ...GRAPH, edges: [{ ...GRAPH.edges[0]!, confidence: 0.85 }] };
    const result = parseGraphV3(bad);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('confidence');
  });

  it('rejects v2-grammar node ids and a missing built_at_commit', () => {
    const bad = {
      ...GRAPH,
      built_at_commit: undefined,
      nodes: [{ id: 'spec:insight.cli', kind: 'file', label: 'x' }],
    };
    const result = parseGraphV3(bad);
    expect(result.ok).toBe(false);
    const joined = result.errors?.join(' ') ?? '';
    expect(joined).toContain('node id');
    expect(joined).toContain('built_at_commit');
  });

  it('AC: no embedding/vector/similarity field is permitted', () => {
    const bad = { ...GRAPH, edges: [{ ...GRAPH.edges[0]!, similarity: 0.93 }] };
    const result = parseGraphV3(bad);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('not permitted');
    const badNode = { ...GRAPH, nodes: [{ ...GRAPH.nodes[0]!, embedding: [0.1, 0.2] }] };
    expect(parseGraphV3(badNode).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseTagsV3 / parseClustersV3
// ---------------------------------------------------------------------------

describe('parseTagsV3', () => {
  it('accepts a well-formed tags file', () => {
    expect(parseTagsV3(TAGS).ok).toBe(true);
  });

  it('rejects an assignment referencing a tag absent from the vocabulary', () => {
    const bad = { ...TAGS, assignments: { 'file:src/auth/session.ts': ['jwt'] } };
    const result = parseTagsV3(bad);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('vocabulary');
  });

  it('rejects a tag kind outside the enum and a malformed assignment key', () => {
    const bad = {
      ...TAGS,
      vocabulary: [{ tag: 'authentication', kind: 'vibe' }],
      assignments: { 'not-a-node': ['authentication'] },
    };
    const result = parseTagsV3(bad);
    expect(result.ok).toBe(false);
    const joined = result.errors?.join(' ') ?? '';
    expect(joined).toContain('kind');
    expect(joined).toContain('node id');
  });
});

describe('parseClustersV3', () => {
  it('accepts a well-formed clusters file', () => {
    expect(parseClustersV3(CLUSTERS).ok).toBe(true);
  });

  it('rejects a bad cluster id, empty rationale, and missing scope', () => {
    const bad = {
      ...CLUSTERS,
      clusters: [{ id: 'auth-core', label: 'x', members: [], rationale: ' ', scope: '' }],
    };
    const result = parseClustersV3(bad);
    expect(result.ok).toBe(false);
    const joined = result.errors?.join(' ') ?? '';
    expect(joined).toContain('cluster:<slug>');
    expect(joined).toContain('rationale');
    expect(joined).toContain('scope');
  });
});

// ---------------------------------------------------------------------------
// parseLedger / parseReverseIndex (§4.10.4/.5)
// ---------------------------------------------------------------------------

const LEDGER: LedgerFile = {
  schemaVersion: '3.0',
  built_at_commit: '9f2c1ab',
  entries: {
    'src/auth/session.ts': { source_sha256: SHA, built_at_commit: '9f2c1ab', extraction_level: 3 },
  },
};

const REVERSE: ReverseIndexFile = {
  schemaVersion: '3.0',
  built_at_commit: '9f2c1ab',
  referenced_by: {
    'element:src/auth/session.ts#validateToken': ['concept:authentication', 'edge:auth-billing-01'],
  },
};

describe('parseLedger', () => {
  it('AC: the staleness ledger matches the contract', () => {
    expect(parseLedger(LEDGER).ok).toBe(true);
  });

  it('rejects a bad hash and a bad extraction_level', () => {
    const bad = {
      ...LEDGER,
      entries: { 'src/x.ts': { source_sha256: 'nope', built_at_commit: '9f2c1ab', extraction_level: 4 } },
    };
    const result = parseLedger(bad);
    expect(result.ok).toBe(false);
    const joined = result.errors?.join(' ') ?? '';
    expect(joined).toContain('source_sha256');
    expect(joined).toContain('extraction_level');
  });
});

describe('parseReverseIndex', () => {
  it('AC: resolves a changed file to its referencing concepts/edges', () => {
    const result = parseReverseIndex(REVERSE);
    expect(result.ok).toBe(true);
    const refs = result.value?.referenced_by['element:src/auth/session.ts#validateToken'];
    expect(refs).toEqual(['concept:authentication', 'edge:auth-billing-01']);
  });

  it('rejects a malformed key and a malformed member', () => {
    const bad = {
      ...REVERSE,
      referenced_by: { 'not-an-id': ['file:src/x.ts'] },
    };
    const result = parseReverseIndex(bad);
    expect(result.ok).toBe(false);
    const joined = result.errors?.join(' ') ?? '';
    expect(joined).toContain('node id');
    expect(joined).toContain('concept:<slug> or edge:');
  });
});

// ---------------------------------------------------------------------------
// parseScopeRegistry (§4.10.3)
// ---------------------------------------------------------------------------

const REGISTRY_YAML = `schemaVersion: "3.0"
built_at_commit: 9f2c1ab
scopes:
  auth:
    path: src/auth
    depends_on: [notifications]
  notifications:
    path: src/shared/notifications
    depends_on: []
    shared_by: [auth]
`;

describe('parseScopeRegistry', () => {
  it('AC: a well-formed registry conforms, and shared_by inverts depends_on', () => {
    const result = parseScopeRegistry(REGISTRY_YAML);
    expect(result.ok).toBe(true);
    expect(Object.keys(result.value?.scopes ?? {})).toEqual(['auth', 'notifications']);
    expect(scopeRegistryAsymmetries(result.value!)).toEqual([]);
  });

  it('tolerates an all-decimal unquoted built_at_commit (YAML numeric coercion), coerced to string', () => {
    // A short sha like 8449872 is all-decimal ~2.8% of the time; unquoted it
    // YAML-parses as a number. Same tolerance as schemaVersion (5e regression).
    const numericSha = REGISTRY_YAML.replace('built_at_commit: 9f2c1ab', 'built_at_commit: 8449872');
    const result = parseScopeRegistry(numericSha);
    expect(result.ok).toBe(true);
    expect(result.value?.built_at_commit).toBe('8449872');
  });

  it('AC: a depends_on cycle is an error', () => {
    const cyclic = `schemaVersion: "3.0"
built_at_commit: 9f2c1ab
scopes:
  a:
    path: src/a
    depends_on: [b]
  b:
    path: src/b
    depends_on: [a]
`;
    const result = parseScopeRegistry(cyclic);
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('cycle');
  });

  it('rejects an undeclared depends_on id and a missing path', () => {
    const bad = `schemaVersion: "3.0"
built_at_commit: 9f2c1ab
scopes:
  auth:
    depends_on: [ghost]
`;
    const result = parseScopeRegistry(bad);
    expect(result.ok).toBe(false);
    const joined = result.errors?.join(' ') ?? '';
    expect(joined).toContain('ghost');
    expect(joined).toContain('path');
  });

  it('asymmetric shared_by is a warning, not a parse error', () => {
    const asym = `schemaVersion: "3.0"
built_at_commit: 9f2c1ab
scopes:
  auth:
    path: src/auth
    depends_on: []
  notifications:
    path: src/shared/notifications
    depends_on: []
    shared_by: [auth]
`;
    const result = parseScopeRegistry(asym);
    expect(result.ok).toBe(true);
    const warnings = scopeRegistryAsymmetries(result.value!);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('does not depend_on');
  });
});

// ---------------------------------------------------------------------------
// Deterministic total-ordered serialization (Rule 7)
// ---------------------------------------------------------------------------

describe('total-ordered serializers', () => {
  it('serializeGraphV3 sorts nodes and edges by id; output is stable', () => {
    const shuffled: InsightGraphV3 = {
      ...GRAPH,
      nodes: [GRAPH.nodes[1]!, GRAPH.nodes[0]!],
    };
    const a = serializeGraphV3(GRAPH);
    const b = serializeGraphV3(shuffled);
    expect(a).toBe(b);
    const parsed = JSON.parse(a) as InsightGraphV3;
    expect(parsed.nodes.map((n) => n.id)).toEqual(['concept:authentication', 'file:src/auth/session.ts']);
    expect(a.endsWith('\n')).toBe(true);
  });

  it('serializeTagsV3 and serializeClustersV3 sort vocabulary/keys/members', () => {
    const tags: TagsFileV3 = {
      ...TAGS,
      vocabulary: [
        { tag: 'logging', kind: 'concern' },
        { tag: 'authentication', kind: 'concern', aliases: ['auth'] },
      ],
      assignments: {
        'file:src/util/log.ts': ['logging'],
        'file:src/auth/session.ts': ['authentication'],
      },
    };
    const out = JSON.parse(serializeTagsV3(tags)) as TagsFileV3;
    expect(out.vocabulary.map((v) => v.tag)).toEqual(['authentication', 'logging']);
    expect(Object.keys(out.assignments)).toEqual(['file:src/auth/session.ts', 'file:src/util/log.ts']);

    const clusters: ClustersFileV3 = {
      ...CLUSTERS,
      clusters: [
        { ...CLUSTERS.clusters[0]!, id: 'cluster:b-zone', members: ['file:z.ts', 'file:a.ts'] },
        { ...CLUSTERS.clusters[0]!, id: 'cluster:a-zone' },
      ],
    };
    const outC = JSON.parse(serializeClustersV3(clusters)) as ClustersFileV3;
    expect(outC.clusters.map((c) => c.id)).toEqual(['cluster:a-zone', 'cluster:b-zone']);
    expect(outC.clusters[1]?.members).toEqual(['file:a.ts', 'file:z.ts']);
  });

  it('serializeLedger and serializeReverseIndex sort their maps', () => {
    const ledger: LedgerFile = {
      ...LEDGER,
      entries: {
        'src/z.ts': { source_sha256: SHA, built_at_commit: '9f2c1ab', extraction_level: 2 },
        'src/a.ts': { source_sha256: SHA, built_at_commit: '9f2c1ab', extraction_level: 3 },
      },
    };
    expect(Object.keys((JSON.parse(serializeLedger(ledger)) as LedgerFile).entries)).toEqual(['src/a.ts', 'src/z.ts']);

    const reverse: ReverseIndexFile = {
      ...REVERSE,
      referenced_by: { 'concept:zeta': ['edge:z', 'edge:a'], 'concept:alpha': ['edge:b'] },
    };
    const out = JSON.parse(serializeReverseIndex(reverse)) as ReverseIndexFile;
    expect(Object.keys(out.referenced_by)).toEqual(['concept:alpha', 'concept:zeta']);
    expect(out.referenced_by['concept:zeta']).toEqual(['edge:a', 'edge:z']);
  });

  it('orderingIssues detects non-total-ordered documents and passes ordered ones', () => {
    expect(orderingIssues('graph', JSON.parse(serializeGraphV3(GRAPH)))).toEqual([]);
    const unordered = {
      ...GRAPH,
      nodes: [GRAPH.nodes[1]!, GRAPH.nodes[0]!],
    };
    expect(orderingIssues('graph', unordered)).toEqual(['nodes are not total-ordered by id']);
    expect(
      orderingIssues('tags', { vocabulary: [{ tag: 'z' }, { tag: 'a' }], assignments: {} }),
    ).toEqual(['vocabulary is not total-ordered by tag']);
    expect(
      orderingIssues('clusters', { clusters: [{ id: 'cluster:z' }, { id: 'cluster:a' }] }),
    ).toEqual(['clusters are not total-ordered by id']);
  });
});

// ---------------------------------------------------------------------------
// The refuse-to-shrink write guard (Rule 7; AC: shrink refused without --force)
// ---------------------------------------------------------------------------

describe('writeInsightJson — the crashed-refresh shrink guard', () => {
  const dirs: string[] = [];
  function tmpFile(name: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-insight-guard-'));
    dirs.push(dir);
    return path.join(dir, name);
  }
  afterEach(() => {
    while (dirs.length > 0) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  function bigGraph(nodes: number): InsightGraphV3 {
    return {
      schemaVersion: '3.0',
      generated: '2026-07-07T14:05:00Z',
      built_at_commit: '9f2c1ab',
      nodes: Array.from({ length: nodes }, (_, i) => ({
        id: `file:src/f${String(i).padStart(3, '0')}.ts`,
        kind: 'file' as const,
        label: `f${i}.ts`,
      })),
      edges: [],
    };
  }

  it('AC: a write that would shrink the graph is refused without force, allowed with it', () => {
    const p = tmpFile('graph.json');
    expect(writeInsightJson(p, 'graph', bigGraph(40)).written).toBe(true);

    const shrunk = writeInsightJson(p, 'graph', bigGraph(12));
    expect(shrunk.written).toBe(false);
    expect(shrunk.refusal).toContain('refusing to shrink');
    // The store is untouched.
    expect((JSON.parse(fs.readFileSync(p, 'utf-8')) as InsightGraphV3).nodes).toHaveLength(40);

    const forced = writeInsightJson(p, 'graph', bigGraph(12), { force: true });
    expect(forced.written).toBe(true);
    expect((JSON.parse(fs.readFileSync(p, 'utf-8')) as InsightGraphV3).nodes).toHaveLength(12);
  });

  it('an equal-or-growing write proceeds without force', () => {
    const p = tmpFile('graph.json');
    writeInsightJson(p, 'graph', bigGraph(10));
    expect(writeInsightJson(p, 'graph', bigGraph(10)).written).toBe(true);
    expect(writeInsightJson(p, 'graph', bigGraph(11)).written).toBe(true);
  });

  it('guards tags and clusters counts too', () => {
    const p = tmpFile('tags.json');
    writeInsightJson(p, 'tags', TAGS);
    const emptied: TagsFileV3 = { ...TAGS, vocabulary: [], assignments: {} };
    const refused = writeInsightJson(p, 'tags', emptied);
    expect(refused.written).toBe(false);
    expect(refused.refusal).toContain('vocabulary');

    const pc = tmpFile('clusters.json');
    writeInsightJson(pc, 'clusters', CLUSTERS);
    const fewer: ClustersFileV3 = { ...CLUSTERS, clusters: [] };
    expect(writeInsightJson(pc, 'clusters', fewer).written).toBe(false);
    expect(writeInsightJson(pc, 'clusters', fewer, { force: true }).written).toBe(true);
  });

  it('throws on a shape-invalid value (producer bug, not a guard refusal)', () => {
    const p = tmpFile('graph.json');
    const invalid = { ...GRAPH, edges: [{ ...GRAPH.edges[0]!, evidence: '' }] } as InsightGraphV3;
    expect(() => writeInsightJson(p, 'graph', invalid)).toThrow(/shape-invalid/);
  });

  it('a corrupt existing file never blocks recovery', () => {
    const p = tmpFile('graph.json');
    fs.writeFileSync(p, '{not json', 'utf-8');
    expect(writeInsightJson(p, 'graph', bigGraph(3)).written).toBe(true);
  });
});
