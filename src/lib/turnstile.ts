// Cloudflare Turnstile server-side verification for /api/contact.
// The widget itself (client-side) is rendered by ContactForm.astro using the
// TURNSTILE_SITE_KEY build-time var — that key is NOT secret, it's meant to
// be visible in the page source (same as reCAPTCHA's site key). Only the
// secret key (verified here) is a real Cloudflare runtime secret.
export interface TurnstileVerifyResult {
  ok: boolean;
  errorCodes?: string[];
}

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
  token: string | null,
  secretKey: string,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  if (!token) return { ok: false, errorCodes: ['missing-input-response'] };
  // A missing/unbound TURNSTILE_SECRET_KEY at runtime surfaces as
  // Cloudflare's own "missing-input-secret" error-code below, but this
  // catches it one step earlier and says so directly, since that's a
  // config problem on our end, not a token problem.
  if (!secretKey) return { ok: false, errorCodes: ['local-secret-key-unset'] };

  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  const res = await fetch(VERIFY_URL, { method: 'POST', body });

  // Cloudflare's siteverify returns real error-codes in the JSON body even
  // on a non-200 status (e.g. HTTP 400 + {"error-codes":["invalid-input-secret"]}
  // for a garbled/wrong secret, or ["missing-input-secret"] for an empty one —
  // confirmed directly against the live endpoint). Parse the body regardless
  // of res.ok so a bad secret key shows up as a real error-code instead of a
  // useless generic "http-400".
  let data: { success?: boolean; 'error-codes'?: string[] } = {};
  try {
    data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
  } catch {
    return { ok: false, errorCodes: [`http-${res.status}-unparseable-body`] };
  }
  return { ok: data.success === true, errorCodes: data['error-codes'] ?? [`http-${res.status}`] };
}
