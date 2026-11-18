import { z } from 'zod'
import {
  ENV_PATTERN,
  FEATURE_PATTERN,
  FORMAT_VERSION,
  KID_PATTERN,
  LICENSE_AUDIENCE,
  LICENSE_ISSUER,
  LIMIT_KEY_PATTERN,
  MAX_FEATURE_LENGTH,
  MAX_FEATURES,
  MAX_LIMIT_KEYS,
  MAX_REVOKED,
  SUB_PATTERN,
  TIER_PATTERN,
} from './vocab'

// Shown in logs and the admin UI, so refused: \p{Cc} control, \p{Cf} format (bidi overrides,
// zero-width), \p{Zl}/\p{Zp} line and paragraph separators, \p{Cs} lone surrogates and \p{Co}
// private use. Not \p{Cn} (unassigned): that set shrinks with each Unicode version, so an older
// Node would refuse a token a newer one accepted. Property escapes, not a \x00-\x1f range, so
// eslint's no-control-regex stays quiet.
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}\p{Co}]/u
const displayText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => !CONTROL_OR_FORMAT.test(s), 'must not contain control or format characters')
    .refine((s) => s.trim() === s, 'must not start or end with whitespace')
/** Duplicates are harmless, so they are dropped rather than failing the whole token. */
const dedupe = (list: string[]): string[] => [...new Set(list)]
/** RFC 3339 UTC, upper-case T and Z, seconds required (PASETO 04-Claims.md recommends Z). */
const claimTime = z.iso.datetime()
const nonNegativeInt = z.number().int().nonnegative()

/**
 * Strict at the top level: an unknown claim is invalid. features, limits, tier and env are
 * forward-compatible: any well-formed value verifies and the product ignores what it does not
 * know.
 */
export const LicensePayloadSchema = z
  .strictObject({
    iss: z.literal(LICENSE_ISSUER),
    aud: z.literal(LICENSE_AUDIENCE),
    sub: z.string().regex(SUB_PATTERN),
    org: displayText(200),
    tier: z.string().regex(TIER_PATTERN),
    features: z
      .array(z.string().max(MAX_FEATURE_LENGTH).regex(FEATURE_PATTERN))
      .max(MAX_FEATURES)
      .transform(dedupe),
    limits: z
      .object({ connections: nonNegativeInt, tenants: nonNegativeInt })
      .catchall(nonNegativeInt)
      .refine((limits) => {
        const keys = Object.keys(limits)
        return keys.length <= MAX_LIMIT_KEYS && keys.every((k) => LIMIT_KEY_PATTERN.test(k))
      }, `limit keys must match ${LIMIT_KEY_PATTERN} (at most ${MAX_LIMIT_KEYS})`),
    label: displayText(64).optional(),
    env: z.string().regex(ENV_PATTERN),
    iat: claimTime,
    nbf: claimTime,
    exp: claimTime,
    ver: z.literal(FORMAT_VERSION),
  })
  .refine((p) => Date.parse(p.nbf) <= Date.parse(p.exp), {
    message: 'nbf must not be after exp',
    path: ['nbf'],
  })
  .refine((p) => Date.parse(p.iat) <= Date.parse(p.exp), {
    message: 'iat must not be after exp',
    path: ['iat'],
  })
export type LicensePayload = z.infer<typeof LicensePayloadSchema>

export const FooterSchema = z.strictObject({ kid: z.string().regex(KID_PATTERN) })
export type Footer = z.infer<typeof FooterSchema>

export const RevocationPayloadSchema = z.strictObject({
  ver: z.literal(FORMAT_VERSION),
  iat: claimTime,
  revoked: z.array(z.string().regex(SUB_PATTERN)).max(MAX_REVOKED).transform(dedupe),
})
export type RevocationPayload = z.infer<typeof RevocationPayloadSchema>

/** Whole-second RFC 3339 UTC ("2026-10-06T17:00:00Z"), the form issued claims use. */
export function toClaimTime(date: Date): string {
  const ms = date.getTime()
  if (!Number.isFinite(ms)) throw new RangeError('toClaimTime: invalid Date')
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z')
}
