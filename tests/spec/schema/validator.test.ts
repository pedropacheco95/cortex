import { describe, it, expect } from 'vitest';
import { SUPPORTED_VERSION } from '../../../src/schema/version.js';
import { validate } from '../../../src/schema/validate.js';
import * as path from 'path';

const VALID_FIXTURE = path.resolve('/Users/pedropacheco1/Documents/Projetos/cortex/tests/fixtures/valid');

describe('Spec-level: full validator over valid fixture', () => {
  it('valid fixture produces conformant report with 0 errors', async () => {
    const report = await validate(VALID_FIXTURE);
    expect(report.schemaVersion).toBe(SUPPORTED_VERSION);
    expect(report.conformant).toBe(true);
    expect(report.counts.error).toBe(0);
    expect(report.target).toBe(VALID_FIXTURE);
  });

  it('report has correct shape', async () => {
    const report = await validate(VALID_FIXTURE);
    expect(typeof report.schemaVersion).toBe('string');
    expect(typeof report.target).toBe('string');
    expect(typeof report.conformant).toBe('boolean');
    expect(Array.isArray(report.violations)).toBe(true);
    expect(typeof report.counts.error).toBe('number');
    expect(typeof report.counts.warning).toBe('number');
  });
});
