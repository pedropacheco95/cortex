export interface ScannedFile {
  path: string;
  tokens: number;
  sha256: string;
  purpose: string;
  needsPurposeRefresh: boolean;
  specLinks: string[];
  definitions: string[];
  imports: string[];
  layer: string;
  lastSeen: string;
}

export interface ScanResult {
  root: string;
  files: ScannedFile[];
  graph: {
    nodes: string[];
    edges: { from: string; to: string; kind: 'import' | 'export' }[];
  };
  layers: Record<string, string[]>;
  full: boolean;
}

export interface ScanOptions {
  full?: boolean;
  forbiddenLLMHook?: () => void;
}
// hook-fire probe 1783074091
