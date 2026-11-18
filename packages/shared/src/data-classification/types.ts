/**
 * Field classification — how sensitive each field of a canonical resource is.
 *
 * Every listable resource type in every vertical carries a sidecar
 * (`apps/integration-server/src/verticals/<v>/schema/classification.ts`) that
 * maps field paths to a class. The class decides what a reader of the stored
 * copy (the admin data viewer, exports, destinations) may see:
 *
 *   public     — fine to show anyone who can see the connection.
 *   internal   — operational data; shown to data readers, never masked.
 *   pii        — personal data about a natural person. Masked unless the
 *                reader holds `data:read_pii` (`revealPii`).
 *   financial  — amounts, balances, prices. Tagged; masked only when the
 *                deployment turns `mask_financial` on.
 *   secret     — credentials / tokens. Always removed, never revealed.
 *
 * A classification is DATA, not code: a plain object literal per resource type,
 * so a reviewer can read it next to the schema it describes.
 */

export type FieldClass = 'public' | 'internal' | 'pii' | 'financial' | 'secret'

/**
 * How a masked value is rendered.
 *
 *   email   — `j***@example.com` (first character + domain kept)
 *   phone   — every digit but the last two replaced by `*`
 *   name    — first letter of each word, rest `***`
 *   address — string → `***`; object → every leaf `***` except country
 *   redact  — `[REDACTED]`
 *   hmac    — keyed HMAC-SHA256, truncated hex: stable, joinable, not reversible
 */
export type MaskKind = 'email' | 'phone' | 'name' | 'address' | 'redact' | 'hmac'

export interface FieldRule {
  class: FieldClass
  /** Mask used when the class is masked for this reader. Defaults to `redact`. */
  mask?: MaskKind
}

/**
 * Field path → rule, for one resource type.
 *
 * Path grammar (segments separated by `.`):
 *   `email`              a top-level field
 *   `billingAddress.city` a nested field
 *   `billingAddress.*`   every direct child of `billingAddress`
 *   `emails[]`           every element of the array `emails`
 *   `emails[].email`     the `email` field of every element of `emails`
 *
 * The key `'*'` alone is the DEFAULT rule for top-level fields no other path
 * touches. Without one, unclassified fields are `internal`.
 *
 * `metadata` and `raw` (the upstream payload) are implicitly `pii`/`redact`
 * unless the classification names them explicitly: they are the platform's
 * unmodified response, and nothing reviewed what is in them.
 */
export type ResourceClassification = Record<string, FieldRule>

/** Default rule key. */
export const DEFAULT_RULE_KEY = '*'

/** Top-level fields treated as `pii`/`redact` unless classified otherwise. */
export const IMPLICIT_PII_FIELDS: ReadonlyArray<string> = ['metadata', 'raw']

export interface MaskOptions {
  /** Reader may see PII (`data:read_pii`). Default false. */
  revealPii?: boolean
  /** Deployment masks financial fields (`data_access.mask_financial`). Default false. */
  maskFinancial?: boolean
  /** Key for the `hmac` mask. Required only when an `hmac` rule is masked. */
  hmacKey?: string | Buffer
}

/**
 * The rules classification sidecars are written with, so a sidecar reads as a
 * table (`email: FIELD_RULES.piiEmail`) rather than a wall of object literals.
 */
export const FIELD_RULES = {
  public: { class: 'public' },
  internal: { class: 'internal' },
  pii: { class: 'pii', mask: 'redact' },
  piiName: { class: 'pii', mask: 'name' },
  piiEmail: { class: 'pii', mask: 'email' },
  piiPhone: { class: 'pii', mask: 'phone' },
  piiAddress: { class: 'pii', mask: 'address' },
  piiHmac: { class: 'pii', mask: 'hmac' },
  financial: { class: 'financial', mask: 'redact' },
  secret: { class: 'secret' },
} as const satisfies Record<string, FieldRule>
