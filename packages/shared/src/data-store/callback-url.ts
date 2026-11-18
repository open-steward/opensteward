/**
 * Validation for the operator-supplied `callback_url` on a sync job.
 *
 * The worker POSTs the finished job to this URL, so an unvalidated value is a
 * server-side request forgery primitive: the request originates inside the
 * deployment, where cloud instance metadata (169.254.169.254), sibling services
 * (admin-api:3001), and anything else on the private network are reachable that
 * a caller outside cannot touch. `z.string().url()` accepts all of it.
 *
 * Two layers, because a hostname check alone is not enough — DNS can resolve a
 * perfectly ordinary name to a private address, before or after validation:
 *
 *   1. `validateCallbackUrl` at enqueue time, so a bad URL is rejected with a
 *      clear 400 rather than failing silently in a background job.
 *   2. `assertResolvesToPublicAddress` immediately before the fetch, which
 *      resolves the name and re-checks the address it actually got.
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export interface CallbackUrlOptions {
  /**
   * Permit plaintext http. Off by default: the callback body names the
   * connection, tenant and platform, and plaintext puts that on the wire.
   * Deployments that post to an internal collector over http can opt in.
   */
  allowInsecure?: boolean
}

export type CallbackUrlResult = { ok: true; url: URL } | { ok: false; reason: string }

/** IPv4 ranges that must never be reachable from a user-supplied callback. */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false
  const [a, b] = parts as [number, number, number, number]
  if (a === 0) return true // "this network"
  if (a === 10) return true // 10.0.0.0/8
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  if (a >= 224) return true // multicast + reserved
  return false
}

function isPrivateIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (addr === '::1' || addr === '::') return true
  if (addr.startsWith('fe80')) return true // link-local
  if (/^f[cd]/.test(addr)) return true // unique-local fc00::/7
  // IPv4-mapped (::ffff:10.0.0.1) inherits the IPv4 rules.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr)
  if (mapped?.[1]) return isPrivateIpv4(mapped[1])
  return false
}

/** True when the literal address must not be called. */
export function isPrivateAddress(host: string): boolean {
  const version = isIP(host)
  if (version === 4) return isPrivateIpv4(host)
  if (version === 6) return isPrivateIpv6(host)
  return false
}

/**
 * Check a callback URL at enqueue time. Rejects non-http(s) schemes, embedded
 * credentials, loopback/private/link-local literals, and — unless the
 * deployment opts in — plaintext http.
 */
export function validateCallbackUrl(raw: string, opts: CallbackUrlOptions = {}): CallbackUrlResult {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'callback_url is not a valid URL' }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return {
      ok: false,
      reason: `callback_url scheme '${url.protocol}' is not supported; use https`,
    }
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'callback_url must not embed credentials' }
  }

  // Address rules first, and deliberately: they are the ones that stop the
  // request reaching somewhere it should not, and they hold whatever the
  // scheme is. Reporting "must use https" for 169.254.169.254 would name the
  // lesser problem.
  const host = url.hostname.replace(/^\[|\]$/g, '')
  // `localhost` and friends resolve to loopback without being IP literals.
  if (/^(localhost|.*\.localhost)$/i.test(host)) {
    return { ok: false, reason: 'callback_url must not point at a loopback address' }
  }
  if (isPrivateAddress(host)) {
    return { ok: false, reason: 'callback_url must not point at a private or link-local address' }
  }

  if (url.protocol === 'http:' && !opts.allowInsecure) {
    return { ok: false, reason: 'callback_url must use https' }
  }

  return { ok: true, url }
}

/**
 * Re-check immediately before the request: resolve the hostname and reject if
 * it lands on a private address. Catches the case a static check cannot — a
 * public name whose DNS record points inside the network, whether by
 * misconfiguration or deliberate rebinding.
 */
export async function assertResolvesToPublicAddress(url: URL): Promise<CallbackUrlResult> {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    return isPrivateAddress(host)
      ? { ok: false, reason: 'callback_url resolves to a private address' }
      : { ok: true, url }
  }
  try {
    const results = await lookup(host, { all: true })
    for (const { address } of results) {
      if (isPrivateAddress(address)) {
        return { ok: false, reason: `callback_url host resolves to a private address (${address})` }
      }
    }
  } catch {
    return { ok: false, reason: 'callback_url host could not be resolved' }
  }
  return { ok: true, url }
}
