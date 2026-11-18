/**
 * Reading values out of a JWT/assertion claim bag.
 *
 * Shared because two features need the same reader and must not drift: the
 * admin-console SSO role mapper (`apps/admin-api/.../idp/role-mapping.ts`,
 * which re-exports `readClaimValues` from here) and the developer-API OIDC
 * verifier (`./oidc-verifier.ts`).
 *
 * Every vendor names and shapes these differently — Auth0 puts scopes in a
 * space-delimited `scope` string, Okta in `scp`, Entra ID in a `roles` array,
 * Keycloak nests them under `realm_access.roles` — so the path is operator
 * configuration, not a constant, and the reader has to tolerate a string, an
 * array, or a nested object at the end of it.
 *
 * Bounds are deliberate. The claim bag is attacker-influenced (it is whatever
 * the IdP was persuaded to mint), so flattening is depth- and count-capped
 * rather than trusting the token to be reasonable.
 */

/** Deepest nesting `flattenToStrings` will walk before giving up. */
const MAX_DEPTH = 8

/**
 * Most values one claim may yield. A token carrying more than this is not a
 * legitimate service account; callers treat the overflow as a rejection
 * rather than silently using a truncated list.
 */
export const MAX_CLAIM_VALUES = 256

function flattenToStrings(value: unknown, depth = 0): string[] {
  if (value == null || depth > MAX_DEPTH) return []
  if (Array.isArray(value)) return value.flatMap((v) => flattenToStrings(v, depth + 1))
  if (typeof value === 'string') return [value]
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  return []
}

/**
 * Read a (possibly dotted) claim path out of the attribute bag, returning the
 * matchable string values found there.
 *
 * Uses `in` rather than truthiness so a claim whose value is `0` or `false`
 * still resolves, and walks only own/inherited string keys — a path segment
 * that is not present ends the walk with no values rather than throwing.
 */
export function readClaimValues(attributes: Record<string, unknown>, claimPath: string): string[] {
  let cursor: unknown = attributes
  for (const segment of claimPath.split('.')) {
    if (cursor && typeof cursor === 'object' && segment in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[segment]
    } else {
      cursor = undefined
      break
    }
  }
  return flattenToStrings(cursor)
}

/**
 * Read a claim expected to name exactly one thing — a subject, a tenant.
 *
 * Returns `null` when the claim is absent, empty, or carries more than one
 * value. The multi-value case is the one that matters: a `tenant` claim
 * arriving as `["acme", "globex"]` is ambiguous, and picking the first would
 * let a token choose which tenant it is read as. Ambiguity fails closed.
 */
export function readSingleClaim(
  attributes: Record<string, unknown>,
  claimPath: string,
): string | null {
  const values = readClaimValues(attributes, claimPath)
  if (values.length !== 1) return null
  const only = values[0].trim()
  return only.length > 0 ? only : null
}

/**
 * Read a claim carrying OAuth scopes, in either shape a provider might use.
 *
 * RFC 6749 defines `scope` as a space-delimited list in a single string, so
 * splitting on whitespace is always correct — a scope token cannot itself
 * contain a space. Array-valued claims (`roles`, `realm_access.roles`) are
 * already split and pass through unchanged.
 *
 * Returns `[]` when the claim yields more than `MAX_CLAIM_VALUES` entries.
 * Empty means no authority, so an oversized claim ends as a 403 rather than
 * as a quietly truncated grant.
 */
export function parseScopeClaim(attributes: Record<string, unknown>, claimPath: string): string[] {
  const raw = readClaimValues(attributes, claimPath)
  if (raw.length > MAX_CLAIM_VALUES) return []
  const out: string[] = []
  for (const value of raw) {
    for (const token of value.split(/\s+/)) {
      if (token.length > 0) out.push(token)
    }
    if (out.length > MAX_CLAIM_VALUES) return []
  }
  return out
}
