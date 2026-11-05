/** The check's records, outside the working tree (specflow.check Rule 18). */
import * as fs from 'fs';
import * as path from 'path';

export interface Event {
  subject: string;
  kind: 'commit' | 'merge' | 'range';
  outcome: 'allowed' | 'refused' | 'error';
  rules: string[];
  warned: string[];
  reasons: string[];
}

export interface Amendment {
  subject: string;
  spec: string;
  file: string;
  item: string;
  change: string;
  trailer: string;
}

export class Log {
  private failed = false;

  constructor(
    private readonly dir: string,
    private readonly warn: (line: string) => void,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private append(file: string, record: object): void {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.appendFileSync(path.join(this.dir, file), `${JSON.stringify({ ts: this.now(), ...record })}\n`);
    } catch (e) {
      if (this.failed) return;
      this.failed = true;
      this.warn(`specflow: warning: could not write the check's log: ${(e as Error).message}`);
    }
  }

  event(e: Event): void {
    this.append('events.jsonl', e);
  }

  amendment(a: Amendment): void {
    this.append('amendments.jsonl', a);
  }
}
