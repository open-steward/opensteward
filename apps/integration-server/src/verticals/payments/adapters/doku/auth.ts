/**
 * DOKU uses an API-key model with a per-request HMAC-SHA256 signature rather
 * than OAuth or a single bearer token. Two static credentials are issued per
 * environment from the DOKU Back Office (Business Account > Service):
 *
 *   clientId   — merchant identifier, sent in the `Client-Id` header
 *   secretKey  — HMAC signing key, never sent on the wire
 *
 * Every request carries `Client-Id`, `Request-Id`, `Request-Timestamp`, and a
 * `Signature` header computed from those plus the request-target and (for POST)
 * a SHA-256 digest of the body. There is no token exchange and nothing to
 * refresh. We collect the pair via the Connect Link form (`customForm`) and
 * stash it on `credentials.extra` so the client can build the signed headers.
 * `accessToken` carries `clientId` purely so the stored credential is never
 * empty (the store requires a non-empty token).
 *
 * Docs: https://jokul.doku.com/docs/docs/technical-references/generate-signature/
 */
import { createHash, createHmac } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'

export interface DokuAuthFields {
  clientId: string
  secretKey: string
  environment: string
}

/** Pull the stored client id (sent in the `Client-Id` header). */
export function clientIdOf(credentials: Credentials): string {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  return String(extra.clientId ?? credentials.accessToken ?? '')
}

/** Pull the stored HMAC secret key (never transmitted). */
export function secretKeyOf(credentials: Credentials): string {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  return String(extra.secretKey ?? '')
}

/** Resolve the configured environment (`sandbox` | `production`). */
export function environmentOf(credentials: Credentials): string {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  return String(extra.environment ?? 'sandbox')
}

/** SHA-256 digest of the JSON body, base64-encoded. Empty string for no body. */
export function digestOf(body: string | undefined): string {
  if (!body) return ''
  return createHash('sha256').update(body, 'utf8').digest('base64')
}

/**
 * Build the DOKU `Signature` header value for a request.
 *
 * The string-to-sign joins one component per line with `\n` (no trailing
 * newline). The `Digest` line is included only when a request body is present
 * (POST); GET/DELETE omit it. The signature is `HMACSHA256=` + the base64
 * HMAC-SHA256 of the string-to-sign keyed with the merchant secret.
 */
export function buildSignature(args: {
  clientId: string
  requestId: string
  requestTimestamp: string
  requestTarget: string
  digest?: string
  secretKey: string
}): string {
  const lines = [
    `Client-Id:${args.clientId}`,
    `Request-Id:${args.requestId}`,
    `Request-Timestamp:${args.requestTimestamp}`,
    `Request-Target:${args.requestTarget}`,
  ]
  if (args.digest) lines.push(`Digest:${args.digest}`)
  const stringToSign = lines.join('\n')
  const mac = createHmac('sha256', args.secretKey).update(stringToSign, 'utf8').digest('base64')
  return `HMACSHA256=${mac}`
}

/** ISO-8601 timestamp in UTC with second precision (e.g. 2026-06-07T08:45:42Z). */
export function dokuTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Fresh unique Request-Id for a single call. */
export function dokuRequestId(): string {
  return randomUUID()
}

/** Validate + pack the Connect Link form into `Credentials`. */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const clientId = (fields.clientId ?? '').trim()
  const secretKey = (fields.secretKey ?? '').trim()
  if (!clientId || !secretKey) {
    throw new Error('DOKU requires a Client ID and a Secret Key.')
  }
  const environment = fields.environment === 'production' ? 'production' : 'sandbox'
  return {
    accessToken: clientId,
    extra: {
      clientId,
      secretKey,
      environment,
    },
  }
}
