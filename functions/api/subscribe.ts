/*
  Email subscribe endpoint: stores an email address in D1.

  Deliberately minimal — no Turnstile, no honeypot. This is a single
  email field, not a multi-field contact form, so the attack surface is
  smaller and the friction should be zero. If spam becomes a problem,
  Turnstile can be added the same way it works on /contact.

  POST /api/subscribe with { email, source? } as JSON or form data.
*/

interface D1Database {
  prepare(query: string): {
    bind(...values: unknown[]): { run(): Promise<unknown> };
  };
}

interface Env {
  DB: D1Database;
}

interface Context {
  request: Request;
  env: Env;
}

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  let email: string;
  let source: string | undefined;

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await request.json() as Record<string, unknown>;
    email = String(body.email ?? '').trim().toLowerCase();
    source = body.source ? String(body.source) : undefined;
  } else {
    const form = await request.formData();
    email = String(form.get('email') ?? '').trim().toLowerCase();
    source = form.get('source') ? String(form.get('source')) : undefined;
  }

  if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return jsonResponse(400, { ok: false, message: 'A valid email address is required.' });
  }

  const submittedAt = new Date().toISOString();

  try {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO subscribers (email, subscribed_at, source) VALUES (?, ?, ?)',
    )
      .bind(email, submittedAt, source ?? null)
      .run();
  } catch (err: any) {
    return jsonResponse(500, { ok: false, message: 'Something went wrong. Please try again.' });
  }

  return jsonResponse(200, { ok: true });
};
