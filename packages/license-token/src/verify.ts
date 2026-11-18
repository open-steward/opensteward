import type { KeyObject } from 'node:crypto'
import type { ZodError } from 'zod'
import {
  assertionFor,
  MAX_FOOTER_BYTES,
  MAX_TOKEN_LENGTH,
  NBF_SKEW_MS,
  type TokenPurpose,
} from './constants'
import { importPublicKey, type KeyMap } from './keys'
import { v4PublicDecode, v4PublicVerify } from './paseto'
import {
  FooterSchema,
  LicensePayloadSchema,
  RevocationPayloadSchema,
  type LicensePayload,
  type RevocationPayload,
} from './schema'
import { FORMAT_VERSION, LICENSE_AUDIENCE, LICENSE_ISSUER } from './vocab'

export type VerifyFailureReason =
  | 'TOO_LARGE'
  | 'NOT_PASETO_V4_PUBLIC'
  | 'MALFORMED'
  | 'FOOTER_INVALID'
  | 'UNKNOWN_KID'
  | 'BAD_KEY'
  | 'BAD_SIGNATURE'
  | 'PAYLOAD_NOT_JSON'
  | 'UNSUPPORTED_VERSION'
  | 'WRONG_ISSUER'
  | 'WRONG_AUDIENCE'
  | 'PAYLOAD_INVALID'
  | 'NOT_YET_VALID'
export interface VerifyFailure {
  ok: false
  reason: VerifyFailureReason
  /** Diagnostic only: field paths and zod issue codes, a kid, or a claim time. Never token text. */
  detail?: string
}
export type LicenseVerification = { ok: true; payload: LicensePayload; kid: string } | VerifyFailure
export type RevocationVerification =
  { ok: true; payload: RevocationPayload; kid: string } | VerifyFailure

const utf8 = new TextEncoder()
const strictUtf8 = new TextDecoder('utf-8', { fatal: true })

function fail(reason: VerifyFailureReason, detail?: string): VerifyFailure {
  return detail === undefined ? { ok: false, reason } : { ok: false, reason, detail }
}
function summarize(error: ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.code}`)
    .join('; ')
}

type Authenticated = { ok: true; kid: string; claims: Record<string, unknown> } | VerifyFailure

/**
 * Order: length cap, header, strict decode, 64-byte split, footer (size, then strict {kid}),
 * own-property kid lookup, key import, Ed25519 over PAE(h, m, f, assertion), fatal UTF-8 +
 * JSON, object, ver.
 */
function authenticate(token: unknown, keyMap: KeyMap, purpose: TokenPurpose): Authenticated {
  if (typeof token !== 'string') return fail('MALFORMED', 'token is not a string')
  if (token.length > MAX_TOKEN_LENGTH) return fail('TOO_LARGE')
  const parts = v4PublicDecode(token)
  if (!parts.ok) return fail(parts.reason)
  if (parts.f.byteLength === 0 || parts.f.byteLength > MAX_FOOTER_BYTES) {
    return fail('FOOTER_INVALID', `footer must be 1..${MAX_FOOTER_BYTES} bytes`)
  }
  let footerJson: unknown
  try {
    footerJson = JSON.parse(strictUtf8.decode(parts.f))
  } catch {
    return fail('FOOTER_INVALID', 'footer is not JSON')
  }
  const footer = FooterSchema.safeParse(footerJson)
  if (!footer.success) return fail('FOOTER_INVALID', summarize(footer.error))
  const { kid } = footer.data
  if (!Object.hasOwn(keyMap, kid)) return fail('UNKNOWN_KID', kid)
  let key: KeyObject
  try {
    key = importPublicKey(keyMap[kid]!)
  } catch {
    return fail('BAD_KEY', kid)
  }
  if (!v4PublicVerify(parts, key, utf8.encode(assertionFor(purpose)))) return fail('BAD_SIGNATURE')
  let claims: unknown
  try {
    claims = JSON.parse(strictUtf8.decode(parts.m))
  } catch {
    return fail('PAYLOAD_NOT_JSON')
  }
  if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) {
    return fail('PAYLOAD_INVALID', 'payload is not a JSON object')
  }
  const record = claims as Record<string, unknown>
  if (record['ver'] !== FORMAT_VERSION) {
    return fail('UNSUPPORTED_VERSION', JSON.stringify(record['ver'])?.slice(0, 32) ?? 'missing')
  }
  return { ok: true, kid, claims: record }
}

/**
 * Offline license verification. Never throws. Expiry is NOT evaluated: an expired but
 * authentic token is ok:true, and the product classifies VALID/EXPIRING/GRACE/DEGRADED from
 * exp and its rollback-protected clock. nbf is checked with a 5-minute skew (NOT_YET_VALID).
 * Pass the token trimmed: a trailing newline is MALFORMED.
 */
export function verifyLicense(token: string, keyMap: KeyMap, now: Date): LicenseVerification {
  try {
    const nowMs = typeof now?.getTime === 'function' ? now.getTime() : Number.NaN
    if (!Number.isFinite(nowMs)) return fail('MALFORMED', 'now is not a valid Date')
    const auth = authenticate(token, keyMap, 'license')
    if (!auth.ok) return auth
    if (auth.claims['iss'] !== LICENSE_ISSUER) return fail('WRONG_ISSUER')
    if (auth.claims['aud'] !== LICENSE_AUDIENCE) return fail('WRONG_AUDIENCE')
    const parsed = LicensePayloadSchema.safeParse(auth.claims)
    if (!parsed.success) return fail('PAYLOAD_INVALID', summarize(parsed.error))
    if (nowMs < Date.parse(parsed.data.nbf) - NBF_SKEW_MS) {
      return fail('NOT_YET_VALID', parsed.data.nbf)
    }
    return { ok: true, payload: parsed.data, kid: auth.kid }
  } catch {
    return fail('MALFORMED', 'unexpected verifier error') // a bad token must never become a crash
  }
}

/**
 * Revocation list (REVOCATIONS_ASSERTION). The caller decides which kids may sign it, and that
 * the payload's `revoked` is checked against the license `sub`. Never throws.
 */
export function verifyRevocationList(token: string, keyMap: KeyMap): RevocationVerification {
  try {
    const auth = authenticate(token, keyMap, 'revocations')
    if (!auth.ok) return auth
    const parsed = RevocationPayloadSchema.safeParse(auth.claims)
    if (!parsed.success) return fail('PAYLOAD_INVALID', summarize(parsed.error))
    return { ok: true, payload: parsed.data, kid: auth.kid }
  } catch {
    return fail('MALFORMED', 'unexpected verifier error')
  }
}
