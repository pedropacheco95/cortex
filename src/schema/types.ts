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
  /** Side channel for non-violation facts a check wants on the record — today
   *  only check.visibility's `allowed by visibility.allow: <path>` lines
   *  (schema §10.1, 3.4 fifth revision). Present only when non-empty. */
  notes?: string[];
}
