import {
  assertionFor,
  ED25519_SIGNATURE_BYTES,
  MAX_FOOTER_BYTES,
  MAX_SIGNING_INPUT_BYTES,
  type TokenPurpose,
} from './constants'
import { v4PublicEncode, v4PublicPreAuth } from './paseto'
import type { Footer, LicensePayload, RevocationPayload } from './schema'
import { canonicalFooterBytes, canonicalPayloadBytes } from './serialize'

const utf8 = new TextEncoder()

function frame(payload: LicensePayload | RevocationPayload, footer: Footer, purpose: TokenPurpose) {
  const m = canonicalPayloadBytes(payload, purpose)
  const f = canonicalFooterBytes(footer)
  // Unreachable while FooterSchema is {kid} (at most 28 bytes); kept as a guard.
  if (f.byteLength > MAX_FOOTER_BYTES) {
    throw new RangeError(`footer is ${f.byteLength} bytes; max ${MAX_FOOTER_BYTES}`)
  }
  const input = v4PublicPreAuth(m, f, utf8.encode(assertionFor(purpose)))
  if (input.byteLength > MAX_SIGNING_INPUT_BYTES) {
    throw new RangeError(
      `signing input is ${input.byteLength} bytes; AWS KMS Sign (MessageType RAW) accepts at most ${MAX_SIGNING_INPUT_BYTES}`,
    )
  }
  return { m, f, input }
}

/**
 * The exact bytes to sign: PAE("v4.public.", payload, footer, implicit assertion). With AWS KMS,
 * use Sign with MessageType RAW and SigningAlgorithm ED25519_SHA_512 (never ED25519_PH_SHA_512).
 * Throws a ZodError for an invalid payload or footer, and a RangeError above 4096 bytes.
 */
export function buildSigningInput(
  payload: LicensePayload,
  footer: Footer,
  purpose?: 'license',
): Uint8Array
export function buildSigningInput(
  payload: RevocationPayload,
  footer: Footer,
  purpose: 'revocations',
): Uint8Array
export function buildSigningInput(
  payload: LicensePayload | RevocationPayload,
  footer: Footer,
  purpose: TokenPurpose = 'license',
): Uint8Array {
  return frame(payload, footer, purpose).input
}

/** Assembles the token from the same canonical bytes plus the 64-byte Ed25519 signature. */
export function assembleToken(
  payload: LicensePayload,
  footer: Footer,
  signature: Uint8Array,
  purpose?: 'license',
): string
export function assembleToken(
  payload: RevocationPayload,
  footer: Footer,
  signature: Uint8Array,
  purpose: 'revocations',
): string
export function assembleToken(
  payload: LicensePayload | RevocationPayload,
  footer: Footer,
  signature: Uint8Array,
  purpose: TokenPurpose = 'license',
): string {
  if (signature.byteLength !== ED25519_SIGNATURE_BYTES) {
    throw new RangeError(
      `Ed25519 signature must be ${ED25519_SIGNATURE_BYTES} bytes, got ${signature.byteLength}`,
    )
  }
  const { m, f } = frame(payload, footer, purpose)
  return v4PublicEncode(m, signature, f)
}
