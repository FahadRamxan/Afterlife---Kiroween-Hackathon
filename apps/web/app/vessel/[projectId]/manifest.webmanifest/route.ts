import { isProjectId } from '../../../../lib/projects';
import { vesselManifest } from '../../../../lib/vessel-manifest';

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isProjectId(projectId)) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(vesselManifest(projectId)), {
    headers: { 'content-type': 'application/manifest+json' },
  });
}
