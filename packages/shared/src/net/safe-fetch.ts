/**
 * SSRF-resistant fetch wrapper.
 *
 * Resolves the target hostname via DNS and refuses to send the request
 * if the resolved IP lies in any of the private / loopback / link-local
 * ranges below. Re-checks on every HTTP redirect, so a public hostname
 * cannot 30x into a metadata service such as `169.254.169.254`.
 *
 * Use this for every outbound HTTP call that could be partly or fully
 * driven by tenant-supplied data — webhook delivery URLs, OAuth
 * redirect targets, adapter callbacks. Adapters making fixed calls to a
 * well-known SaaS host don't strictly need it but should also use it as
 * defence in depth.
 *
 * Dev escape valve: setting `OST_ALLOW_PRIVATE_HOSTS=1` skips the IP
 * checks entirely. Default in non-production so `pnpm dev` can hit a
 * mock server on `localhost`.
 */
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Public-IP-only allow-list. Rejection ranges, IPv4 + IPv6:
 *
 *   10.0.0.0/8       — RFC 1918 private
 *   172.16.0.0/12    — RFC 1918 private
 *   192.168.0.0/16   — RFC 1918 private
 *   127.0.0.0/8      — loopback (IPv4)
 *   169.254.0.0/16   — link-local (includes 169.254.169.254 metadata)
 *   0.0.0.0/8        — "this network" / current network
 *   100.64.0.0/10    — RFC 6598 shared address space (carrier-grade NAT)
 *
 *   ::1/128          — loopback (IPv6)
 *   fc00::/7         — RFC 4193 unique local
 *   fe80::/10        — link-local (IPv6)
 *   ::ffff:0:0/96    — IPv4-mapped IPv6 (re-check the embedded v4)
 */

export class SsrfBlockedError extends Error {
  readonly host: string
  readonly address: string
  constructor(host: string, address: string) {
    super(`SSRF block: ${host} resolved to ${address}, which is in a private/reserved range`)
    this.name = 'SsrfBlockedError'
    this.host = host
    this.address = address
  }
}

export function isPrivateIp(address: string): boolean {
  const family = isIP(address)
  if (family === 0) return false
  if (family === 4) return isPrivateIpv4(address)
  return isPrivateIpv6(address)
}

function isPrivateIpv4(addr: string): boolean {
  const parts = addr.split('.').map((p) => Number(p))
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return false
  }
  const [a, b] = parts as [number, number, number, number]
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 0) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

function isPrivateIpv6(addr: string): boolean {
  const lower = addr.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // fc00::/7
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  )
    return true // fe80::/10
  // IPv4-mapped IPv6: ::ffff:a.b.c.d — re-check the embedded v4
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice('::ffff:'.length)
    if (isIP(v4) === 4) return isPrivateIpv4(v4)
  }
  return false
}

/**
 * DNS resolver injected for testability (vitest can't spy on ESM
 * module namespaces). May return a single record or all of them; the
 * default resolves EVERY A/AAAA record so a round-robin that mixes a
 * public and a private address cannot slip a private one past the check.
 */
export type DnsResolver = (
  host: string,
) => Promise<{ address: string } | Array<{ address: string }>>
const defaultResolver: DnsResolver = (host) => dnsLookup(host, { all: true })
let dnsResolver: DnsResolver = defaultResolver

/** Test hook — swap the DNS resolver. Pass `undefined` to restore. */
export function setDnsResolver(resolver: DnsResolver | undefined): void {
  dnsResolver = resolver ?? defaultResolver
}

/**
 * Resolve a hostname and verify EVERY resolved address is public. Throws
 * SsrfBlockedError on any private/reserved IP, and on a name that resolves
 * to nothing (fail closed).
 *
 * No-op when `OST_ALLOW_PRIVATE_HOSTS=1` is set (dev convenience).
 *
 * KNOWN RESIDUAL (DNS rebinding): this validates the name, then `safeFetch`
 * calls the platform `fetch`, which performs its OWN resolution at connect
 * time. A record served with a 0-TTL that flips public→private between the two
 * lookups can still be dialed. Closing that fully needs connection-level IP
 * pinning (a custom undici dispatcher that connects to the vetted address
 * while preserving SNI) — a dependency this package does not carry.
 * Validating all records here closes the multi-record round-robin variant,
 * which needs no timing race.
 */
export async function assertPublicHost(host: string): Promise<void> {
  if (process.env['OST_ALLOW_PRIVATE_HOSTS'] === '1') return
  // If the host is already an IP literal, no DNS lookup needed.
  if (isIP(host) !== 0) {
    if (isPrivateIp(host)) throw new SsrfBlockedError(host, host)
    return
  }
  const resolved = await dnsResolver(host)
  const records = Array.isArray(resolved) ? resolved : [resolved]
  if (records.length === 0) {
    // A name that resolves to nothing must not be dialed — fail closed.
    throw new SsrfBlockedError(host, '(no address)')
  }
  for (const { address } of records) {
    if (isPrivateIp(address)) throw new SsrfBlockedError(host, address)
  }
}

/**
 * Drop-in fetch replacement that validates the destination before the
 * request and on every redirect. Returns a standard `Response` on
 * success; throws `SsrfBlockedError` when any hop resolves to a
 * private IP.
 *
 * `init.redirect` is forced to `'manual'` so we can re-validate. Set
 * `init.redirect = 'manual'` yourself if you want the wrapper to
 * surface the original 3xx response without following it.
 */
export async function safeFetch(input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
  let url: string
  if (typeof input === 'string') {
    url = input
  } else if (input instanceof URL) {
    url = input.toString()
  } else {
    // Request object — extract the URL string
    url = input.url
  }
  const maxRedirects = 5
  for (let i = 0; i < maxRedirects; i++) {
    const parsed = new URL(url)
    await assertPublicHost(parsed.hostname)
    const res = await fetch(url, { ...init, redirect: 'manual' })
    if (res.status < 300 || res.status >= 400) return res
    const location = res.headers.get('location')
    if (!location) return res
    url = new URL(location, url).toString()
  }
  throw new Error(`safeFetch: too many redirects (>${maxRedirects})`)
}
