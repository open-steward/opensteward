/**
 * Deterministic connection ids for the sandbox.
 *
 * `/test/v1/{vertical}/*` needs a `connection_id` like every other vertical
 * route, but a sandbox connection has nothing to connect to — there is no OAuth
 * grant and no upstream account. Deriving the id from `(tenant, vertical)`
 * rather than storing one means a fresh test key can call the API immediately:
 * no seeding step, no first-request race between replicas, and the same ids
 * after a restart or on another node.
 *
 * It also turns validation into a whitelist. The middleware recomputes the ids
 * for the caller's OWN tenant and requires an exact match, so a live connection
 * UUID cannot be smuggled in and neither can another tenant's sandbox id — the
 * check never consults a table it could be tricked about.
 *
 * UUIDv5 (RFC 4122 §4.3) so the values are real UUIDs: `isValidUuid` accepts
 * versions 1-8, and the vertical routes reject anything that is not a UUID
 * before they reach this comparison.
 */
import { createHash } from 'crypto'

/**
 * Namespace UUID for sandbox connection ids. A fixed random v4, generated once
 * and pinned here — changing it changes every tenant's sandbox connection ids
 * and orphans whatever they have stored, so it must never be regenerated.
 */
const SANDBOX_NAMESPACE = '6f9619ff-8b86-d011-b42d-00c04fc964ff'

function uuidV5(namespace: string, name: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  // Version 5 in the high nibble of byte 6, RFC 4122 variant in byte 8.
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/**
 * The sandbox connection id for one tenant's view of one vertical. Lowercase,
 * stable, and distinct per tenant so two tenants' sandboxes never collide.
 */
export function sandboxConnectionId(tenantId: string, vertical: string): string {
  return uuidV5(SANDBOX_NAMESPACE, `${tenantId}:${vertical}`)
}

/** The full set for a tenant, for `GET /test/v1/connections`. */
export function sandboxConnectionIds(
  tenantId: string,
  verticals: readonly string[],
): Array<{ vertical: string; connectionId: string }> {
  return verticals.map((vertical) => ({
    vertical,
    connectionId: sandboxConnectionId(tenantId, vertical),
  }))
}

/**
 * Whether `connectionId` is the sandbox connection this tenant may use for this
 * vertical. The caller's tenant comes from the verified API key, never from the
 * request body, so this cannot be widened by anything the client sends.
 */
export function isSandboxConnectionId(
  connectionId: string,
  tenantId: string,
  vertical: string,
): boolean {
  return connectionId.toLowerCase() === sandboxConnectionId(tenantId, vertical)
}
