import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const repo = process.cwd();
const mod = (rel) => import(pathToFileURL(path.join(repo, 'dist', rel)).href);
const { init } = await mod('cli/init.js');
const { run: preWrite } = await mod('hooks/pre-write.js');
const { extractMessages, extractToolUses, parseSessionJsonl } = await mod('sessions/read.js');
const { CLAUDE_SESSION_REF_PATTERN } = await mod('schema/provenance-index.js');
const { hasExcludedSegment } = await mod('insight/exclude.js');
const { validateDistilCandidate } = await mod('pulse/distil.js');
const { checkInsightObservations } = await mod('schema/checks/insight.js');
const { keywordMatches, tokenise } = await mod('recall/query.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-codex-probe-'));
const root = path.join(tmp, 'project');
const home = path.join(tmp, 'home');
fs.mkdirSync(root); fs.mkdirSync(home);
const result = await init(root, { home, appSupportDir: path.join(tmp, 'app-support'), platform: 'darwin', yes: true, noLlm: true, profile: 'superpowers' });
const exists = (rel) => fs.existsSync(path.join(root, rel));
const output = { fixture: tmp, init: {
  exitCode: result.exitCode,
  profile: 'superpowers',
  claudeInstructions: exists('CLAUDE.md'), codexInstructions: exists('AGENTS.md'),
  claudeHooks: exists('.claude/settings.json'), codexHooks: exists('.codex/hooks.json'),
  claudeSkills: fs.readdirSync(path.join(root, '.claude/skills')).length,
  codexSkills: exists('.agents/skills'), specflowScaffold: exists('.specflow/specs'),
}};
fs.writeFileSync(path.join(root, '.cortex/compass/rules/R-999-probe.md'), '---\nid: R-999\ntitle: Probe convention\ngoverns: ["src/**/*.ts"]\n---\n\n# Probe\nKeep the established convention.\n');
const base = { cwd: root, session_id: 'probe', hook_event_name: 'PreToolUse' };
const claude = await preWrite({ ...base, tool_name: 'Edit', tool_input: { file_path: 'src/demo.ts', old_string: 'a', new_string: 'b' } });
const codex = await preWrite({ ...base, tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Update File: src/demo.ts\n@@\n-a\n+b\n*** End Patch' } });
output.preWrite = { claudeEmitsRule: claude.stdout.includes('R-999'), codexPatchEmitsRule: codex.stdout.includes('R-999'), codexExitCode: codex.exitCode };
const claudeEntries = [{ type: 'user', message: { role: 'user', content: 'Remember the design decision.' } }, { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'cortex why src/demo.ts' } }] } }];
// Public exec JSONL event shape, not a claim about private transcript format.
const codexEntries = [{ type: 'thread.started', thread_id: 'probe' }, { type: 'item.completed', item: { id: '1', type: 'agent_message', text: 'Remember the design decision.' } }, { type: 'item.completed', item: { id: '2', type: 'command_execution', command: 'cortex why src/demo.ts', status: 'completed', exit_code: 0, aggregated_output: '' } }];
for (const [name, entries] of [['claude', claudeEntries], ['codexExec', codexEntries]]) {
  const parsed = parseSessionJsonl(entries.map(e => JSON.stringify(e)).join('\n'));
  output[name] = { acceptedRecords: parsed.entries.length, messages: extractMessages(parsed.entries).length, tools: extractToolUses(parsed.entries).length };
}
output.exclusions = Object.fromEntries(['.claude/skills/a/SKILL.md', '.agents/skills/a/SKILL.md', '.codex/hooks.json'].map(p => [p, hasExcludedSegment(p)]));
output.provenanceGrammar = { claude: CLAUDE_SESSION_REF_PATTERN.test('claude-sessions/user/session'), codex: CLAUDE_SESSION_REF_PATTERN.test('codex-sessions/user/session') };
const obs = path.join(root, '.cortex/insight/observations/probe.md');
fs.mkdirSync(path.dirname(obs), { recursive: true });
fs.writeFileSync(obs, '---\nkind: insight-observation\nupdated: 2026-09-21T00:00:00Z\nsalient: false\nsessions: ["codex-sessions/user/session"]\n---\n\nA synthetic observation.\n');
output.codexObservationViolations = checkInsightObservations(root).filter(v => v.location.path.endsWith('probe.md')).map(v => ({ check: v.check, message: v.message }));
const candidate = { type: 'skill-proposal', pattern: 'repeatable workflow', occurrences: 3, sessionIds: ['probe'], proposedText: '---\nname: example\ndescription: example\n---\nExample', confidence: 'INFERRED' };
output.skillProposal = Object.fromEntries(['.claude/skills/example/SKILL.md', '.agents/skills/example/SKILL.md'].map(proposedTarget => [proposedTarget, validateDistilCandidate({ ...candidate, proposedTarget }) !== null]));
const index = { entries: { 'decision.session-retention': { kind: 'decision', title: 'Session retention', path: '.cortex/atlas/decisions/session-retention.md', date: '2026-09-21', keywords: ['session', 'retention'] } }, subjects: {} };
output.retrieval = Object.fromEntries(['session retention', 'remember earlier conversations'].map(q => { const t = tokenise(q, index); return [q, keywordMatches(index, t.tokens, t.refs).length]; }));
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
output.packageContract = { publishedRoots: pkg.files, schemaInFreshProject: exists('cortex-schema.md'), schemaInPublishedRoots: pkg.files.includes('cortex-schema.md') };
fs.mkdirSync(path.join(root, 'src'), { recursive: true });
const source = 'export const demo = true;\n';
fs.writeFileSync(path.join(root, 'src/demo.ts'), source);
const entryPath = path.join(root, '.cortex/insight/anatomy/src/demo.ts.md');
fs.mkdirSync(path.dirname(entryPath), { recursive: true });
fs.writeFileSync(entryPath, `---\npath: src/demo.ts\nextracted_at: 2026-09-21T00:00:00Z\nextraction_level: 2\nsize_lines: 1\nsize_tokens: 8\ncentrality: low\nbuilt_at_commit: probe\nsource_sha256: ${createHash('sha256').update(source).digest('hex')}\n---\n\n## Purpose\nExports the demo flag.\n\n## Connections\nNone.\n`);
output.rootResolution = {};
for (const [label, cwd] of [['root', root], ['subdirectory', path.join(root, 'src')]]) {
  const proc = spawnSync(process.execPath, [path.join(repo, 'dist/cli/cli.js'), 'insight', 'file', 'src/demo.ts', '--json'], { cwd, encoding: 'utf8' });
  const body = JSON.parse(proc.stdout);
  output.rootResolution[label] = { exitCode: proc.status, found: body.found, ...(body.error ? { error: body.error } : {}) };
}
fs.writeFileSync(process.argv[2] ?? '/tmp/cortex-codex-compat-probe.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
