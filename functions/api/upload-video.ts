/*
  Upload endpoint for video files. Receives a file from the Sanity Studio
  custom input component, stores it in the R2 bucket, and returns the
  public URL.

  Requires three bindings in Cloudflare Pages → Settings → Bindings:
    VIDEO_BUCKET   R2 bucket binding
    UPLOAD_TOKEN   secret string — must match the Studio's env var
    VIDEO_PUBLIC_URL   the public URL base of the bucket
                       (e.g. https://video.rumeaudesign.co)
*/

interface Env {
  VIDEO_BUCKET: R2Bucket;
  UPLOAD_TOKEN: string;
  VIDEO_PUBLIC_URL: string;
}

const ALLOWED_ORIGINS = [
  'https://rumeau-design-co.sanity.studio',
  'http://localhost:3333',
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Token',
    'Access-Control-Max-Age': '86400',
  };
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const cors = corsHeaders(request.headers.get('Origin'));

  if (!env.VIDEO_BUCKET) {
    return Response.json(
      { error: 'R2 bucket not bound — add VIDEO_BUCKET in Pages settings' },
      { status: 500, headers: cors },
    );
  }

  if (request.headers.get('X-Upload-Token') !== env.UPLOAD_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file provided' }, { status: 400, headers: cors });
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const key = `v/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  await env.VIDEO_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'video/mp4' },
  });

  let base = (env.VIDEO_PUBLIC_URL || '').replace(/\/$/, '');
  if (base && !base.startsWith('http')) base = `https://${base}`;
  const url = `${base}/${key}`;

  return Response.json({ url }, { headers: cors });
};
