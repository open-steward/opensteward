/**
 * Flash messages — the one way this app reports the outcome of an action.
 *
 * The rule:
 *
 *   An outcome that survives a navigation is a toast (this module).
 *   An outcome that belongs to a form still on screen stays inline.
 *   A value the operator must copy is document content, and belongs to the
 *   handler that produced it — never a flash, never a query string.
 *
 * This replaces "redirect with `?saved=1`, read it back on the next render".
 * That put the message in the URL, which made it a property of the address
 * rather than an event: Back, Forward, a refresh or a shared link all replayed
 * "Saved." for something that had not just happened. A message here is queued
 * on the response, spent by the next page that actually renders, and gone.
 *
 * Shaped like `core/auth/csrf.ts`: pure functions plus one registrar, no
 * server-side state. That matters — admin runs `replicas: 2` under Helm with no
 * session affinity, so the cookie has to BE the state. An in-process store
 * would drop messages whenever the redirect landed on the other pod.
 *
 * Deliberately NOT a field on the `session` cookie: the CSRF token is an HMAC
 * of that cookie's value (`auth/csrf.ts:20-22`), so mutating it on every POST
 * would invalidate every CSRF token already rendered into an open page.
 *
 * Known limit, by design: `sameSite: 'strict'` means a flash cannot survive the
 * SSO round-trip through a different origin (`routes/sso.ts`). Nothing needs it
 * to — login and first-run setup report failures inline, beside the form. If
 * you find a message vanishing across an SSO hop, this is why; do not loosen
 * the cookie to fix it.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { cookieSecure } from './auth/session-cookie'

export type FlashTone = 'success' | 'danger' | 'warning' | 'info'

export interface FlashMessage {
  tone: FlashTone
  body: string
}

const TONES: readonly FlashTone[] = ['success', 'danger', 'warning', 'info']

export const FLASH_COOKIE = 'os_flash'

/**
 * Per-message and total payload budgets.
 *
 * Browsers cap a single cookie near 4096 bytes including the name, attributes
 * and signature, and base64 inflates by 4/3. Truncating here is not tidiness:
 * a browser that silently drops an oversized cookie leaves the operator with no
 * feedback at all, which is worse than a clipped sentence. Upstream error
 * strings are the realistic overflow — several routes surface
 * `err.response.data.error` verbatim.
 */
const MAX_BODY_CHARS = 512
const MAX_PAYLOAD_BYTES = 3000

/** Pending messages for THIS response, before they are serialised. */
const PENDING = Symbol('flashPending')
/** True when the incoming request carried a flash we published to locals. */
const CONSUMED = Symbol('flashConsumed')

interface FlashReply extends FastifyReply {
  [PENDING]?: FlashMessage[]
  [CONSUMED]?: boolean
}

function encode(messages: FlashMessage[]): string {
  return Buffer.from(JSON.stringify(messages), 'utf8').toString('base64url')
}

function decode(raw: string): FlashMessage[] {
  const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  if (!Array.isArray(parsed)) return []
  const out: FlashMessage[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const { tone, body } = entry as { tone?: unknown; body?: unknown }
    // Validate the tone against the union rather than trusting it: it becomes a
    // CSS class and picks the icon, and it decides whether the toast is sticky.
    if (typeof tone !== 'string' || !TONES.includes(tone as FlashTone)) continue
    if (typeof body !== 'string' || !body) continue
    out.push({ tone: tone as FlashTone, body })
  }
  return out
}

function clamp(body: string): string {
  const trimmed = body.trim()
  return trimmed.length > MAX_BODY_CHARS ? `${trimmed.slice(0, MAX_BODY_CHARS - 1)}…` : trimmed
}

/**
 * Queue a message for the next page that renders. Appends — call twice and the
 * operator sees two toasts, in order.
 */
export function setFlash(reply: FastifyReply, message: FlashMessage): void {
  const body = clamp(message.body)
  if (!body) return

  const target = reply as FlashReply
  const pending = (target[PENDING] ??= [])
  pending.push({ tone: message.tone, body })

  // Drop oldest until the payload fits. Losing the first of three messages
  // beats the browser discarding all of them.
  let encoded = encode(pending)
  while (pending.length > 1 && Buffer.byteLength(encoded, 'utf8') > MAX_PAYLOAD_BYTES) {
    pending.shift()
    encoded = encode(pending)
  }

  // `setCookie` overwrites by name+domain+path, so rewriting the whole array on
  // each call is correct rather than additive.
  reply.setCookie(FLASH_COOKIE, encoded, {
    path: '/',
    httpOnly: true,
    signed: true,
    sameSite: 'strict',
    // Same rule as the session cookie, deliberately shared: a deployment that
    // can store one and not the other keeps working but loses every error
    // banner, which is worse than either failing outright.
    secure: cookieSecure(),
    // Backstop only — the real lifetime is one render. Bounds the case where
    // the operator abandons the redirect, so a stale message cannot surface on
    // some unrelated navigation later.
    maxAge: 60,
  })
}

export function flashSuccess(reply: FastifyReply, body: string): void {
  setFlash(reply, { tone: 'success', body })
}

export function flashError(reply: FastifyReply, body: string): void {
  setFlash(reply, { tone: 'danger', body })
}

/** Messages queued on this response — for tests and the onSend guard. */
export function pendingFlashes(reply: FastifyReply): FlashMessage[] {
  return (reply as FlashReply)[PENDING] ?? []
}

/**
 * Read incoming flashes onto `reply.locals.flashes`, and clear the cookie once
 * they have actually been displayed.
 *
 * The local is `flashes`, plural, and always an array. `flash` is already a
 * view local in two routes, and `@fastify/view` merges per-call `data` OVER
 * `reply.locals` — so a hook publishing `locals.flash` would be silently
 * overwritten on exactly those pages, with no error and no failing test.
 */
export function registerFlash(fastify: FastifyInstance): void {
  fastify.addHook('preHandler', (request: FastifyRequest, reply: FastifyReply, done) => {
    // Cheap exit on the overwhelmingly common request. This self-limits better
    // than another copy of the /public + /design + /health exemption list,
    // which exists twice in server.ts and would be a third copy to keep in
    // sync.
    const raw = request.cookies[FLASH_COOKIE]
    if (!raw) return done()

    let messages: FlashMessage[] = []
    try {
      const unsigned = request.unsignCookie(raw)
      if (unsigned.valid && unsigned.value) messages = decode(unsigned.value)
    } catch {
      // Tampered, truncated or from an older format. Show nothing; the onSend
      // hook below still clears it so it cannot wedge.
    }

    ;(reply as FlashReply)[CONSUMED] = true
    if (messages.length) {
      // Mutate, never reassign — @fastify/view captured this reference.
      const locals = ((reply as unknown as { locals?: Record<string, unknown> }).locals ??= {})
      locals.flashes = messages
    }
    return done()
  })

  fastify.addHook('onSend', (_request, reply, payload, done) => {
    const target = reply as FlashReply
    if (!target[CONSUMED]) return done(null, payload)
    // A handler queued a NEW message on this same response — leave it alone.
    if (pendingFlashes(reply).length > 0) return done(null, payload)

    // Clear on DISPLAY, not on read. That single choice is what makes the rest
    // fall out correctly:
    //   - a 302 carries no text/html, so a flash survives an intermediate
    //     redirect and is spent by the first thing that actually renders;
    //   - the layout's /api/version-info fetch fires on every page and is JSON,
    //     so it cannot race the document and eat the message;
    //   - the CSV export downloads without navigating, and the message keeps.
    const contentType = String(reply.getHeader('content-type') ?? '')
    if (!contentType.startsWith('text/html')) return done(null, payload)

    reply.clearCookie(FLASH_COOKIE, { path: '/' })
    // Not optional. Without it the replay bug simply moves from the query
    // string into the HTTP cache: Back re-serves the cached HTML with the
    // payload still in it. It would look fixed under `inject` (no cache) while
    // still replaying in a real browser. Also opts this one document out of
    // bfcache, so Back re-requests, finds the cookie gone, and shows nothing.
    reply.header('cache-control', 'no-store')
    return done(null, payload)
  })
}
