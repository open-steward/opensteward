/**
 * Self-describing sandbox Connect Link tokens.
 *
 * The live flow stores a session row and hands out an opaque token; the
 * sandbox stores nothing, so its token must carry what the hosted mock pages
 * need to recover: the tenant and the (seeded) customer. Format:
 *
 *   base64url(`${tenantId}:${customerId}`) + '.' + first 8 hex of
 *   uuid5(`${tenantId}:link:${customerId}`)
 *
 * Deterministic (same tenant+customer → same token, like every other sandbox
 * id), URL-safe, and carrying a NON-SECRET integrity suffix. The suffix
 * catches truncation/tampering; it is not authentication. Forging a token for
 * another tenant is explicitly accepted: completing the mock flow only ever
 * yields that tenant's DERIVED connection id, which is useless without their
 * test key — the same trust model as the live, unauthenticated `/connect/*`
 * surface, where possession of a link token is the credential.
 *
 * No egress: node:crypto only. Walked by check:sandbox-egress via its
 * importers (sandbox-control-plane-router, sandbox-auth-router).
 */
import { createHash } from 'node:crypto'

/** Same namespace as `sandbox/ids.ts` — all sandbox-derived ids share it. */
const NS = '6f9619ff-8b86-d011-b42d-00c04fc964ff'

function uuid5(name: string): string {
  const ns = Buffer.from(NS.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest()
  const b = Buffer.from(hash.subarray(0, 16))
  b[6] = (b[6]! & 0x0f) | 0x50
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = b.toString('hex')
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join(
    '-',
  )
}

/** The two deterministic seeded customer ids for a tenant — must stay in
 *  lockstep with `seedCustomers` in sandbox-control-plane-router. */
export function sandboxCustomerIds(tenantId: string): string[] {
  return [0, 1].map((i) => uuid5(`${tenantId}:customer:${i}`))
}

function suffixFor(tenantId: string, customerId: string): string {
  return uuid5(`${tenantId}:link:${customerId}`).replace(/-/g, '').slice(0, 8)
}

export function encodeSandboxLinkToken(tenantId: string, customerId: string): string {
  const body = Buffer.from(`${tenantId}:${customerId}`, 'utf8').toString('base64url')
  return `${body}.${suffixFor(tenantId, customerId)}`
}

export interface SandboxLinkToken {
  tenantId: string
  customerId: string
}

/**
 * Decode + validate. Returns null for anything malformed: bad shape, suffix
 * mismatch, or a customer id outside the tenant's seeded pair.
 */
export function decodeSandboxLinkToken(token: string): SandboxLinkToken | null {
  const m = /^([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(token)
  if (!m) return null
  let decoded: string
  try {
    decoded = Buffer.from(m[1]!, 'base64url').toString('utf8')
  } catch {
    return null
  }
  // customerId is a UUID (no colons); tenant ids may contain anything but we
  // split on the LAST colon so a tenant id containing ':' still round-trips.
  const sep = decoded.lastIndexOf(':')
  if (sep <= 0 || sep === decoded.length - 1) return null
  const tenantId = decoded.slice(0, sep)
  const customerId = decoded.slice(sep + 1)
  if (suffixFor(tenantId, customerId) !== m[2]) return null
  if (!sandboxCustomerIds(tenantId).includes(customerId)) return null
  return { tenantId, customerId }
}
