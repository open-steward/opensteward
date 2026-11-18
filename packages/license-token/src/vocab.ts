/**
 * Vocabulary shared by both sides of the license contract. The product gates on it; the
 * license service validates what it issues against it (Stripe entitlement lookup keys,
 * tiers, envs). Any change here is coordinated: release this package, then update the license
 * service.
 */
export const VERTICALS = [
  'accounting',
  'crm',
  'ecommerce',
  'logistics',
  'payments',
  'docsign',
  'projects',
  'customer-support',
  'inventory',
] as const
export type Vertical = (typeof VERTICALS)[number]
export type VerticalFeature = `vertical:${Vertical}`

export function verticalFeature(vertical: Vertical): VerticalFeature {
  return `vertical:${vertical}`
}

export type KnownFeature = 'mcp' | VerticalFeature | 'sso' | 'audit_export'
/** Features this release knows. Tokens may carry other well-formed ones; the product ignores them. */
export const KNOWN_FEATURES: readonly KnownFeature[] = Object.freeze([
  'mcp',
  ...VERTICALS.map(verticalFeature),
  'sso',
  'audit_export',
])
const KNOWN_FEATURE_SET = new Set<string>(KNOWN_FEATURES)
export function isKnownFeature(feature: string): feature is KnownFeature {
  return KNOWN_FEATURE_SET.has(feature)
}

/** `name` or `namespace:name`, lower case. The suffix allows hyphens (vertical:customer-support). */
export const FEATURE_PATTERN = /^[a-z][a-z0-9_]*(?::[a-z0-9][a-z0-9-]*)?$/
export const MAX_FEATURE_LENGTH = 64
export const MAX_FEATURES = 128

/**
 * `tier` is lenient: any lower-case slug verifies, so a tier introduced later never turns
 * tokens INVALID on installs that predate it. Display and analytics only: never gate on tier;
 * features and limits are the source of truth. The service validates against KNOWN_TIERS.
 */
export const TIER_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/
export const KNOWN_TIERS = ['free', 'pro', 'enterprise'] as const
export type KnownTier = (typeof KNOWN_TIERS)[number]
export function isKnownTier(tier: string): tier is KnownTier {
  return (KNOWN_TIERS as readonly string[]).includes(tier)
}

/**
 * `env` is lenient like `tier`. The product treats only "dev" specially (a loud warning,
 * and dev-signed tokens must carry it). The service validates against KNOWN_ENVS.
 */
export const ENV_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/
export const KNOWN_ENVS = ['prod', 'dev'] as const
export type KnownEnv = (typeof KNOWN_ENVS)[number]
export function isKnownEnv(env: string): env is KnownEnv {
  return (KNOWN_ENVS as readonly string[]).includes(env)
}

/** Every token must carry these. `tenants` counts admin-api tenants, including "default". */
export const LIMIT_KEYS = ['connections', 'tenants'] as const
export type LimitKey = (typeof LIMIT_KEYS)[number]
/** Extra limit keys must match this; the product ignores the ones it does not know. */
export const LIMIT_KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/
export const MAX_LIMIT_KEYS = 16
/**
 * Display only: a limit at or above this is shown as "Unlimited" by the product and the
 * license service alike. Tokens still carry the plain integer (there is no sentinel), and
 * enforcement still compares numbers.
 */
export const UNLIMITED_FROM = 1_000_000
export function isUnlimitedLimit(limit: number): boolean {
  return limit >= UNLIMITED_FROM
}

export const LICENSE_ISSUER = 'opensteward.dev'
export const LICENSE_AUDIENCE = 'opensteward'
export const FORMAT_VERSION = 1

/** License IDs: besides the org name, the only identifier a token carries. */
export const SUB_PATTERN = /^lic_[A-Za-z0-9]{6,64}$/
/** Opaque key IDs (k2026a…, r2026a…, dev1, devk1), independent of the key bytes. */
export const KID_PATTERN = /^[a-z0-9]{1,16}$/
/** Hard cap on one revocation list. The 4096-byte KMS cap usually binds first (see README). */
export const MAX_REVOKED = 256
