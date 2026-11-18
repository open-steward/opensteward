import { verify, type KeyObject } from 'node:crypto'
import { decodeBase64UrlStrict, encodeBase64Url } from './base64url'
import { ED25519_SIGNATURE_BYTES, PASETO_HEADER } from './constants'
import { pae } from './pae'

const HEADER = new TextEncoder().encode(PASETO_HEADER)

export interface V4PublicParts {
  m: Uint8Array
  sig: Uint8Array
  f: Uint8Array
}

/** The message Ed25519 signs: PAE(h, m, f, i) (Version4.md, Sign step 3). */
export function v4PublicPreAuth(m: Uint8Array, f: Uint8Array, i: Uint8Array): Uint8Array {
  return pae([HEADER, m, f, i])
}

/** h || base64url(m || sig) [|| '.' || base64url(f)]. A footer is appended only when non-empty. */
export function v4PublicEncode(m: Uint8Array, sig: Uint8Array, f: Uint8Array): string {
  if (sig.byteLength !== ED25519_SIGNATURE_BYTES) {
    throw new RangeError(
      `Ed25519 signature must be ${ED25519_SIGNATURE_BYTES} bytes, got ${sig.byteLength}`,
    )
  }
  const body = new Uint8Array(m.byteLength + sig.byteLength)
  body.set(m, 0)
  body.set(sig, m.byteLength)
  const token = PASETO_HEADER + encodeBase64Url(body)
  return f.byteLength > 0 ? `${token}.${encodeBase64Url(f)}` : token
}

export type V4PublicDecoded =
  ({ ok: true } & V4PublicParts) | { ok: false; reason: 'NOT_PASETO_V4_PUBLIC' | 'MALFORMED' }

export function v4PublicDecode(token: string): V4PublicDecoded {
  if (!token.startsWith(PASETO_HEADER)) return { ok: false, reason: 'NOT_PASETO_V4_PUBLIC' }
  const parts = token.slice(PASETO_HEADER.length).split('.')
  if (parts.length > 2) return { ok: false, reason: 'MALFORMED' }
  const [bodyText, footerText] = parts as [string, string?]
  if (footerText !== undefined && footerText.length === 0) return { ok: false, reason: 'MALFORMED' }
  const body = decodeBase64UrlStrict(bodyText)
  if (body === null || body.byteLength < ED25519_SIGNATURE_BYTES) {
    return { ok: false, reason: 'MALFORMED' }
  }
  const f = footerText === undefined ? new Uint8Array(0) : decodeBase64UrlStrict(footerText)
  if (f === null) return { ok: false, reason: 'MALFORMED' }
  const split = body.byteLength - ED25519_SIGNATURE_BYTES
  return { ok: true, m: body.subarray(0, split), sig: body.subarray(split), f }
}

/** Ed25519 over PAE(h, m, f, i). Never throws: any crypto error is a failed verification. */
export function v4PublicVerify(parts: V4PublicParts, key: KeyObject, i: Uint8Array): boolean {
  try {
    return verify(null, v4PublicPreAuth(parts.m, parts.f, i), key, parts.sig)
  } catch {
    return false
  }
}
