/**
 * Production license public keys: kid → base64url (no padding) of the raw
 * 32-byte Ed25519 key. Every install trusts all five from the first release
 * (handover D11), so rotating the signing key needs no customer upgrade;
 * removing one is a release. Values come ONLY from the license service's AWS
 * KMS keys (GetPublicKey → SPKI → the last 32 bytes), through a pull request.
 *
 *   k2026a  active signing key      r2026a  reserve / emergency
 *   k2026b  next rotation           r2026b  reserve / emergency
 *   k2026c  rotation after that
 *
 * Exported from the license service's KMS keys on 2026-11-07 (A3.9). A
 * `PLACEHOLDER:<kid>` value verifies nothing (verifyLicense answers BAD_KEY
 * for its kid and never throws), and a release that still carries one is
 * blocked (check:license-keys --release, A3.3). No imports:
 * scripts/check-license-keys.ts loads this file from source.
 *
 * The license service reads this file as text (its keys:check), so keep this
 * shape: one `Object.freeze({` block of `kid: '<value>',` lines, then `})`.
 * check:license-keys enforces it (checkKeyFileShape).
 */
export const PRODUCTION_KIDS = ['k2026a', 'k2026b', 'k2026c', 'r2026a', 'r2026b'] as const
export type ProductionKid = (typeof PRODUCTION_KIDS)[number]

export const PRODUCTION_KEYS: Readonly<Record<ProductionKid, string>> = Object.freeze({
  k2026a: 'zS8hfBbQAePwmVjD1cRO883H5a4tqTCTmdvzOG36R40',
  k2026b: 'MeAVq7baIn6dRnwLEvayqeoAy_1b9YQQ8ssJUIK56DQ',
  k2026c: '3HU00_HFXHHfDIJnm8zveAuGjqieqNBx_-5Aui7jOCk',
  r2026a: 'd3Og-VEE1_9fJ4_ISkcKyBB4dKiMja4HOMpr7xBoII0',
  r2026b: 'QTwd_TqpcHxCljqww8vwWhio6wU-Mg1MJKEJSAkyUSk',
})
