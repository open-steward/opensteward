/**
 * @opensteward/license-token: the OpenSteward license token contract.
 *
 * PASETO v4.public (Ed25519) tokens. The license service builds the exact signing input,
 * signs it with AWS KMS and assembles the token; OpenSteward verifies it offline. Elastic
 * License 2.0 ("license key functionality"). Named re-exports only, never `export *`: explicit
 * names keep ESM named imports of this CommonJS build detectable.
 */
export {
  ENV_PATTERN,
  FEATURE_PATTERN,
  FORMAT_VERSION,
  KID_PATTERN,
  KNOWN_ENVS,
  KNOWN_FEATURES,
  KNOWN_TIERS,
  LICENSE_AUDIENCE,
  LICENSE_ISSUER,
  LIMIT_KEY_PATTERN,
  LIMIT_KEYS,
  MAX_FEATURE_LENGTH,
  MAX_FEATURES,
  MAX_LIMIT_KEYS,
  MAX_REVOKED,
  SUB_PATTERN,
  TIER_PATTERN,
  UNLIMITED_FROM,
  VERTICALS,
  isKnownEnv,
  isKnownFeature,
  isKnownTier,
  isUnlimitedLimit,
  verticalFeature,
} from './vocab'
export type {
  KnownEnv,
  KnownFeature,
  KnownTier,
  LimitKey,
  Vertical,
  VerticalFeature,
} from './vocab'
export {
  LICENSE_ASSERTION,
  MAX_FOOTER_BYTES,
  MAX_SIGNING_INPUT_BYTES,
  MAX_TOKEN_LENGTH,
  NBF_SKEW_MS,
  PASETO_HEADER,
  REVOCATIONS_ASSERTION,
} from './constants'
export type { TokenPurpose } from './constants'
export { decodeBase64UrlStrict, encodeBase64Url } from './base64url'
export { pae } from './pae'
export { importPublicKey, publicKeyFromSpkiDer } from './keys'
export type { KeyMap } from './keys'
export { FooterSchema, LicensePayloadSchema, RevocationPayloadSchema, toClaimTime } from './schema'
export type { Footer, LicensePayload, RevocationPayload } from './schema'
export { canonicalPayloadBytes } from './serialize'
export { assembleToken, buildSigningInput } from './sign'
export { verifyLicense, verifyRevocationList } from './verify'
export type {
  LicenseVerification,
  RevocationVerification,
  VerifyFailure,
  VerifyFailureReason,
} from './verify'
