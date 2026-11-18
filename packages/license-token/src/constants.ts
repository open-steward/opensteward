/** PASETO v4.public header, trailing period included (Version4.md, Sign step 2). */
export const PASETO_HEADER = 'v4.public.'
/** Implicit assertions: signed, never carried. They bind a token to one purpose. */
export const LICENSE_ASSERTION = 'opensteward-license-v1'
export const REVOCATIONS_ASSERTION = 'opensteward-revocations-v1'
/** AWS KMS Sign with MessageType RAW caps the message at 4096 bytes. Pure Ed25519 cannot pre-hash. */
export const MAX_SIGNING_INPUT_BYTES = 4096
/** A 4096-byte signing input yields at most ~5.5 KB of token. Anything longer is refused unparsed. */
export const MAX_TOKEN_LENGTH = 6144
/** The footer is `{"kid":"…"}`: at most 28 bytes when canonical. The cap bounds hostile input. */
export const MAX_FOOTER_BYTES = 256
/** `nbf` tolerance for clock skew between the issuing service and the install. */
export const NBF_SKEW_MS = 5 * 60 * 1000
export const ED25519_SIGNATURE_BYTES = 64
export const ED25519_PUBLIC_KEY_BYTES = 32

/** What a token is for. Each purpose has its own implicit assertion, so one can never pass as the other. */
export type TokenPurpose = 'license' | 'revocations'

export function assertionFor(purpose: TokenPurpose): string {
  return purpose === 'license' ? LICENSE_ASSERTION : REVOCATIONS_ASSERTION
}
