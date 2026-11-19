// Raise an uploaded app (Prompt 40): POST the zip to /api/uploads. The server checks it again,
// virus-scans it and builds its js-dos bundle; the browser goes to the new project's page.

export type UploadAnswer =
  | { ok: true; projectId: string }
  | { ok: false; code: string; message: string; programs?: string[] };

/** Never throws. `code` is the API's error code, or UNCONFIGURED or DOWN. */
export async function postUpload(
  api: string | undefined,
  zip: Uint8Array,
  fileName: string,
  executable?: string,
  fetcher: typeof fetch = fetch,
): Promise<UploadAnswer> {
  if (!api) return { ok: false, code: 'UNCONFIGURED', message: '' };
  const form = new FormData();
  if (executable) form.append('executable', executable);
  form.append('zip', new Blob([zip as BlobPart], { type: 'application/zip' }), fileName);
  let res: Response;
  try {
    res = await fetcher(`${api.replace(/\/+$/, '')}/api/uploads`, { method: 'POST', body: form });
  } catch {
    return { ok: false, code: 'DOWN', message: '' };
  }
  const body = (await res.json().catch(() => ({}))) as {
    project?: { id?: string };
    error?: string;
    message?: string;
    programs?: string[];
  };
  if (res.ok && body.project?.id) return { ok: true, projectId: body.project.id };
  return {
    ok: false,
    code: body.error ?? `HTTP_${res.status}`,
    message: body.message ?? `The API answered ${res.status}`,
    ...(body.programs ? { programs: body.programs } : {}),
  };
}
