import { describe, expect, it } from 'vitest';
import { JobDataSchema, PIPELINE, nextStep } from './jobs';
import { JOB_TYPES } from './schema';

describe('the pipeline order', () => {
  it('is the Crew order from crew.md, and every step is a job type', () => {
    expect(PIPELINE).toEqual([
      'possess',
      'archaeology',
      'rebirth',
      'undertake',
      'prove',
      'exorcise',
    ]);
    for (const s of PIPELINE) expect(JOB_TYPES).toContain(s);
  });

  it('nextStep walks it once, and on-demand jobs have no next', () => {
    const walked: string[] = [];
    for (let s: (typeof PIPELINE)[number] | null = 'possess'; s; s = nextStep(s)) walked.push(s);
    expect(walked).toEqual([...PIPELINE]);
    expect(nextStep('scan-upload')).toBe('possess');
    expect(nextStep('twin-replay')).toBeNull();
    expect(nextStep('voice-change')).toBeNull();
  });
});

describe('JobDataSchema', () => {
  it('takes a project id with optional force and pipeline flags, and nothing else', () => {
    const projectId = '0192f5a0-0000-7000-8000-000000000001';
    expect(JobDataSchema.parse({ projectId, pipeline: true })).toEqual({
      projectId,
      pipeline: true,
    });
    expect(() => JobDataSchema.parse({ projectId, extra: 1 })).toThrow();
    expect(() => JobDataSchema.parse({ projectId: 'shifa' })).toThrow();
  });
});
