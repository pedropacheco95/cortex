export type Severity = 'error' | 'warning';

export interface Violation {
  severity: Severity;
  check: string;
  clause: string;
  location: {
    path: string;
    key?: string;
    line?: number;
  };
  message: string;
}

export interface ValidationReport {
  schemaVersion: string;
  target: string;
  conformant: boolean;
  violations: Violation[];
  counts: { error: number; warning: number };
}
