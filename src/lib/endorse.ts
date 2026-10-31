/*
  SIGNED VOTES - the shared part of functions/api/votes.ts (where a vote can
  carry a signature) and functions/api/endorse.ts (Chris's approve link, and
  the public list the page shows).

  Chris: "making the votes public or private so that people could leave
  their name or their username ... a digital handle, likely for Instagram,
  and like a link to their work ... little pop-up votes if the vote filter
  is on that says, like, this person liked this ... I could sort of get
  endorsements that way."

  - A signature belongs to a person (the browser's random visitor id), not
    to one vote: signed once, every piece they vote for carries it.
  - Public or private is theirs to choose. Private: only Chris sees it.
  - Public names show only once Chris has said so. A new public signer
    sends him one email with "Show" and "Keep it off" links, signed with a
    key the server holds (so nobody else can approve); the link opens a page
    with a button, because mail scanners open links on their own.
  - Kept in D1 with the votes, never in Sanity. The IP address is still
    never stored.
*/

export type Sign = {name: string; link: string; public: boolean};

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g;

/** A signature as sent, cleaned, or null when it holds nothing usable. */
export function readSign(raw: unknown): Sign | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = String(r.name ?? '').replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) return null;
  let link = String(r.link ?? '').replace(CONTROL, '').trim().slice(0, 200);
  if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
  try {
    if (link) {
      const u = new URL(link);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) link = '';
      else link = u.toString();
    }
  } catch {
    link = '';
  }
  // A bare @handle with no link: Chris's guess is Instagram, so it links there.
  const handle = name.match(/^@([A-Za-z0-9._]{1,30})$/);
  if (!link && handle) link = `https://www.instagram.com/${handle[1]}/`;
  return {name, link, public: r.public !== false};
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/*
  The approve links' signature. ENDORSE_KEY when the site has one; otherwise
  derived from the email key the server already holds, so this works with
  nothing new to set up - and no one without that key can make a link.
*/
export async function signLink(env: {ENDORSE_KEY?: string; RESEND_API_KEY?: string}, visitor: string, act: string) {
  const secret = (env.ENDORSE_KEY || env.RESEND_API_KEY || '').trim();
  if (!secret) return '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`endorse-v1:${secret}`), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${visitor}:${act}`))).slice(0, 32);
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!);
