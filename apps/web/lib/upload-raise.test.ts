import { describe, expect, it, vi } from 'vitest';
import { postUpload } from './upload-raise';

const project = { id: '0192f5a0-1234-7abc-8def-0123456789ab' };
const json = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const zip = new Uint8Array([0x50, 0x4b, 3, 4]);

describe('postUpload', () => {
  it('sends the zip (and the chosen program) and returns the new project id', async () => {
    const f = json(201, { project, upload: { status: 'scanning' } });
    expect(await postUpload('https://a/', zip, 'shifa.zip', 'SHIFA.EXE', f)).toEqual({
      ok: true,
      projectId: project.id,
    });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://a/api/uploads');
    const form = (init as RequestInit).body as FormData;
    expect(form.get('executable')).toBe('SHIFA.EXE');
    expect((form.get('zip') as File).name).toBe('shifa.zip');
  });

  it('passes on the reason it was refused, with the programs to choose from', async () => {
    const f = json(400, {
      error: 'WHICH_PROGRAM',
      message: 'Choose',
      programs: ['A.EXE', 'B.EXE'],
    });
    expect(await postUpload('https://a', zip, 'x.zip', undefined, f)).toEqual({
      ok: false,
      code: 'WHICH_PROGRAM',
      message: 'Choose',
      programs: ['A.EXE', 'B.EXE'],
    });
    expect((f.mock.calls[0]![1] as RequestInit & { body: FormData }).body.has('executable')).toBe(
      false,
    );
  });

  it('sends the DOS clock the owner chose', async () => {
    const f = json(201, { project, upload: { status: 'scanning' } });
    await postUpload('https://a', zip, 'x.zip', undefined, f, '1999-12-31 18:30:00');
    expect(((f.mock.calls[0]![1] as RequestInit).body as FormData).get('dosTime')).toBe(
      '1999-12-31 18:30:00',
    );
  });

  it('says when the API is not there or not configured', async () => {
    expect(await postUpload(undefined, zip, 'x.zip')).toEqual({
      ok: false,
      code: 'UNCONFIGURED',
      message: '',
    });
    const down = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await postUpload('https://a', zip, 'x.zip', undefined, down)).toEqual({
      ok: false,
      code: 'DOWN',
      message: '',
    });
  });
});
