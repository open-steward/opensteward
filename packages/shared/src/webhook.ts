/**
 * Shared webhook utilities.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export type WebhookHandler = {
  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean
  parseWebhookEvents(payload: Record<string, unknown>): unknown[]
  /**
   * Optional: extract the platform's external account identifier (Stripe
   * `acct_…`, Shopify shop domain, Xero tenant id, …) from the raw body +
   * headers, WITHOUT trusting it for auth. The unified router uses it to route
   * the event to the owning connection (and, later, to select the right
   * per-connection signing secret). The value is only acted on AFTER
   * `verifyWebhook` passes — a forged id simply selects the wrong connection,
   * whose secret then fails verification.
   *
   * Use this (not a widened `parseWebhookEvents`) for header-sourced ids:
   * many adapters already take a single-string 2nd arg to `parseWebhookEvents`.
   */
  extractAccountId?(rawBody: Buffer, headers: Record<string, string>): string | undefined
  /**
   * Optional: parse with the request headers, for platforms whose event name
   * travels only in a header (Help Scout `X-HelpScout-Event`). The unified
   * router prefers it over `parseWebhookEvents` when present. A separate
   * member for the same reason as `extractAccountId`: widening
   * `parseWebhookEvents` would hand a headers object to the adapters whose
   * second argument is a string.
   */
  parseWebhookEventsWithHeaders?(
    payload: Record<string, unknown>,
    headers: Record<string, string>,
  ): unknown[]
  /**
   * Optional: asynchronous verification with per-connection context, for
   * platforms whose proof cannot be checked with one shared-secret string
   * (Zoho Desk's `X-ZDesk-JWT`: RS256 under rotating public keys that must be
   * fetched, bound to an org id and a webhook id per connection).
   *
   * When present, the unified router calls it INSTEAD of `verifyWebhook`, with
   * one candidate per stored connection on (vertical, platform), and:
   *   - `null` or a throw → 401 (fail closed);
   *   - a result naming a connection that is not one of the candidates → 401;
   *   - otherwise every parsed event is routed to exactly that connection.
   *     Body-sourced routing hints (`externalAccountId`) are ignored on this
   *     path, because the body may not be covered by the proof.
   *
   * `bodyAuthenticated` must be `false` when the proof does not cover the raw
   * body. The router then tells the consumer, which stops body-derived data
   * from causing destructive side effects (a cache delete).
   */
  verifyWebhookWithContext?(
    rawBody: Buffer,
    headers: Record<string, string>,
    candidates: readonly WebhookVerificationCandidate[],
  ): Promise<WebhookContextVerification | null>
}

/** One stored connection the async verifier may attribute a delivery to. */
export interface WebhookVerificationCandidate {
  connectionId: string
  /** The connection's decrypted `credentials.extra` (never the tokens). */
  extra: Readonly<Record<string, unknown>>
  /**
   * The connection's per-connection webhook value: set by `registerWebhook`
   * or by an operator through `PUT /admin/connections/:id/webhook-secret`.
   * Undefined when unset.
   */
  webhookSecret?: string
}

export interface WebhookContextVerification {
  /** Must be one of the candidates' `connectionId`. */
  connectionId: string
  /** `false` when the verified proof does not cover the request body. */
  bodyAuthenticated: boolean
}

/**
 * Compute HMAC-SHA256 of a payload and compare to an expected value using
 * constant-time comparison to prevent timing attacks.
 */
export function verifyHmacSha256(
  payload: Buffer,
  secret: string,
  expected: string,
  encoding: 'hex' | 'base64' = 'base64',
): boolean {
  try {
    const computed = createHmac('sha256', secret).update(payload).digest(encoding)
    const a = Buffer.from(computed)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Strip a prefix from a signature header value.
 * e.g. "sha256=abcdef..." → "abcdef..."
 */
export function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

/**
 * Stripe-style signature header: `t=<timestamp>,v1=<sig>`. The signed
 * payload is `${timestamp}.${rawBody}`. We verify both the HMAC and
 * that the timestamp is within `toleranceMs` of now — without the
 * timestamp check, an attacker who captures one signed delivery can
 * replay it indefinitely.
 *
 * Returns `true` only when the signature matches AND the timestamp is
 * inside the tolerance window. Returns `false` on any parse or
 * verification failure (fail-closed).
 */
export function verifyStripeStyleSignature(opts: {
  rawBody: Buffer
  header: string | undefined
  secret: string
  /** Sliding window in ms. Default: 300 000 (5 min) — matches Stripe. */
  toleranceMs?: number
  /** Test hook. */
  now?: () => number
}): boolean {
  const { rawBody, header, secret } = opts
  if (!header || !secret) return false
  const toleranceMs = opts.toleranceMs ?? 5 * 60 * 1000
  const now = opts.now?.() ?? Date.now()

  // Parse `t=<ts>,v1=<sig>` — order-independent, ignores unknown keys.
  const parts = new Map<string, string>()
  for (const piece of header.split(',')) {
    const eq = piece.indexOf('=')
    if (eq < 0) continue
    parts.set(piece.slice(0, eq).trim(), piece.slice(eq + 1).trim())
  }
  const tsRaw = parts.get('t')
  const sig = parts.get('v1')
  if (!tsRaw || !sig) return false
  const tsSec = Number(tsRaw)
  if (!Number.isFinite(tsSec)) return false

  // Replay window — timestamp is in seconds, like Stripe.
  const tsMs = tsSec * 1000
  if (Math.abs(now - tsMs) > toleranceMs) return false

  const signedPayload = Buffer.concat([Buffer.from(`${tsRaw}.`), rawBody])
  return verifyHmacSha256(signedPayload, secret, sig, 'hex')
}

/**
 * GitHub-style signature header: `sha256=<hex>`. The signed payload is
 * the raw body. No timestamp — GitHub doesn't include one in the
 * signature; replay protection must come from the consumer (event id
 * dedupe is the usual approach).
 */
export function verifyGithubStyleSignature(opts: {
  rawBody: Buffer
  header: string | undefined
  secret: string
}): boolean {
  if (!opts.header || !opts.secret) return false
  const sig = stripPrefix(opts.header, 'sha256=')
  return verifyHmacSha256(opts.rawBody, opts.secret, sig, 'hex')
}
