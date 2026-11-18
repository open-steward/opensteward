/**
 * Server-side fetch of an identity provider's profile-picture URL.
 *
 * The URL arrives in an OIDC `picture` claim, a SAML attribute or a SCIM
 * `photos` entry — values the IdP (and, for many IdPs, the user themselves)
 * controls. admin-api fetching it is a textbook SSRF sink, so every request
 * goes through the same fixed gauntlet:
 *
 *   1. `https:` only, default port only, no userinfo in the URL.
 *   2. Resolve every A/AAAA record through c-ares, cancellably and within the
 *      budget (`caresAvatarResolver`); refuse the fetch if ANY of them is
 *      private, loopback, link-local, multicast, unspecified, reserved, or
 *      IPv6 outside global unicast 2000::/3 or inside a tunnelling prefix
 *      (`isBlockedAddress`). An IP-literal host is checked as is.
 *   3. Connect to the address that was vetted — the socket's `lookup` is
 *      pinned to it — so a DNS answer that changes between the check and the
 *      connect (rebinding) cannot redirect the connection. SNI and the Host
 *      header still carry the hostname, so TLS verification is unchanged.
 *      No agent: an env-configured proxy can never take the pin away.
 *   4. No redirects: any 3xx is a failure, never followed.
 *   5. One 5 s budget for the whole attempt (DNS, connect, TLS, body); on
 *      every exit the request is aborted and outstanding DNS cancelled, and a
 *      non-200 response is hung up on rather than drained.
 *   6. At most 512 KB, enforced while streaming, not after.
 *   7. The bytes must sniff as PNG, JPEG or WebP; the response's
 *      Content-Type is ignored.
 *
 * `shared`'s `isPrivateIp` is consulted first; the stricter parser here adds
 * multicast, reserved and documentation ranges, and makes IPv6 an
 * allow-list (global unicast minus Teredo, 6to4 and documentation). The shared escape hatch
 * `OST_ALLOW_PRIVATE_HOSTS` is deliberately NOT honoured: a profile picture
 * is never worth reaching into the deployment's own network.
 *
 * Failures throw `AvatarFetchError` with a coarse `reason`; callers log the
 * reason and the host, never the URL (query strings carry signatures and
 * sometimes an email hash).
 */
import { Resolver } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { isPrivateIp } from '@opensteward/shared'
import { AVATAR_MAX_BYTES, checkAvatarBytes, type AvatarMime } from '../../users/avatar-image'

export const AVATAR_FETCH_TIMEOUT_MS = 5_000

export type AvatarFetchFailure =
  | 'invalid_url'
  | 'not_https'
  | 'blocked_port'
  | 'blocked_address'
  | 'dns'
  | 'timeout'
  | 'redirect'
  | 'http_status'
  | 'too_large'
  | 'not_image'
  | 'network'

export class AvatarFetchError extends Error {
  constructor(
    readonly reason: AvatarFetchFailure,
    message: string,
  ) {
    super(message)
    this.name = 'AvatarFetchError'
  }
}

export interface ResolvedAddress {
  address: string
  family: number
}

/** Resolve a hostname to every address it has, within `timeoutMs`, giving up
 *  when `signal` aborts. */
export type AvatarResolver = (
  host: string,
  opts?: { timeoutMs: number; signal: AbortSignal },
) => Promise<ResolvedAddress[]>

/** Perform one GET against an already-vetted address. Must not follow
 *  redirects and must stop reading past `maxBytes`. */
export type AvatarTransport = (req: {
  url: URL
  address: string
  family: number
  signal: AbortSignal
  maxBytes: number
}) => Promise<{ status: number; body: Buffer }>

export interface AvatarFetchOptions {
  resolve?: AvatarResolver
  transport?: AvatarTransport
  timeoutMs?: number
  maxBytes?: number
}

export interface FetchedAvatar {
  bytes: Buffer
  contentType: AvatarMime
}

// ── Address policy ────────────────────────────────────────────────────────

function ipv4Octets(addr: string): number[] | null {
  const parts = addr.split('.')
  if (parts.length !== 4) return null
  const out = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  return out.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? out : null
}

function blockedIpv4(o: number[]): boolean {
  const [a, b, c] = o as [number, number, number, number]
  return (
    a === 0 || // "this network"
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    a === 127 ||
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, TEST-NET-1
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    a >= 224 // 224/4 multicast, 240/4 reserved, 255.255.255.255 broadcast
  )
}

/** Expand an IPv6 literal to 16 bytes, or null if it is not one. */
function ipv6Bytes(addr: string): number[] | null {
  let s = addr.toLowerCase()
  const zone = s.indexOf('%')
  if (zone !== -1) s = s.slice(0, zone)
  let tail: number[] = []
  const lastColon = s.lastIndexOf(':')
  if (s.slice(lastColon + 1).includes('.')) {
    const v4 = ipv4Octets(s.slice(lastColon + 1))
    if (!v4) return null
    tail = v4
    s = `${s.slice(0, lastColon + 1)}0:0`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const parse = (part: string) => (part === '' ? [] : part.split(':'))
  const head = parse(halves[0]!)
  const rest = halves.length === 2 ? parse(halves[1]!) : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null
  const groups = [...head, ...Array(Math.max(missing, 0)).fill('0'), ...rest]
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null
  const bytes = groups.flatMap((g) => {
    const n = parseInt(g, 16)
    return [n >> 8, n & 0xff]
  })
  if (tail.length) bytes.splice(12, 4, ...tail)
  return bytes
}

/**
 * IPv6 is an allow-list: global unicast, `2000::/3`, plus DNS64's
 * `64:ff9b::/96` judged by the IPv4 it embeds. That alone refuses `::`,
 * `::1`, every other IPv4-in-IPv6 form (`::ffff:0:0/96` mapped,
 * `::ffff:0:0:0/96` SIIT, `::/96` compatible, local-use NAT64
 * `64:ff9b:1::/48`), discard `100::/64`, unique-local
 * `fc00::/7`, link-local, site-local and multicast `ff00::/8`. Inside
 * 2000::/3 the special-purpose and tunnelling prefixes are refused too: a
 * tunnel's far end (Teredo, 6to4) can be any IPv4 address, private included,
 * and this check cannot see it.
 */
function blockedIpv6(b: number[]): boolean {
  // 64:ff9b::/96 is what DNS64 (RFC 6147) synthesises for an IPv4-only host
  // on an IPv6-only network. Refusing it would refuse every such host there,
  // so decode it and apply the IPv4 rules to the embedded address. The
  // local-use prefix 64:ff9b:1::/48 stays refused (below): its translator is
  // site-defined and can reach anything.
  if (
    b[0] === 0x00 &&
    b[1] === 0x64 &&
    b[2] === 0xff &&
    b[3] === 0x9b &&
    b.slice(4, 12).every((x) => x === 0)
  ) {
    return blockedIpv4(b.slice(12, 16))
  }
  if ((b[0]! & 0xe0) !== 0x20) return true // not 2000::/3
  // 2001::/23 IETF protocol assignments — includes Teredo 2001::/32,
  // benchmarking 2001:2::/48 and ORCHID.
  if (b[0] === 0x20 && b[1] === 0x01 && (b[2]! & 0xfe) === 0x00) return true
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true // 2001:db8::/32 documentation
  if (b[0] === 0x20 && b[1] === 0x02) return true // 2002::/16 6to4
  if (b[0] === 0x3f && b[1] === 0xff && (b[2]! & 0xf0) === 0x00) return true // 3fff::/20 documentation
  return false
}

/**
 * True for any address a profile-picture fetch must never reach. Unparseable
 * input is blocked too — fail closed.
 */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 0) return true
  if (isPrivateIp(address)) return true
  if (family === 4) {
    const o = ipv4Octets(address)
    return !o || blockedIpv4(o)
  }
  const b = ipv6Bytes(address)
  return !b || blockedIpv6(b)
}

// ── Default network plumbing ──────────────────────────────────────────────

/** The part of `dns.promises.Resolver` the fetch uses; injectable for tests. */
export interface DnsResolverLike {
  resolve4(host: string): Promise<string[]>
  resolve6(host: string): Promise<string[]>
  cancel(): void
}

export type DnsResolverFactory = (opts: { timeout: number; tries: number }) => DnsResolverLike

/**
 * Resolve through c-ares (`dns.promises.Resolver`), not `dns.lookup`.
 *
 * `dns.lookup` is getaddrinfo on the libuv threadpool — the pool bcrypt also
 * runs on — and cannot be cancelled: a nameserver that never answers would
 * pin pool threads long after the fetch gave up, and sign-ins would stall
 * behind it. c-ares runs on the event loop, takes a per-query timeout (the
 * fetch's remaining budget, one try) and `cancel()`s outstanding queries,
 * which the fetch does at its deadline and on every exit.
 *
 * A and AAAA are asked in parallel and merged; every answer is vetted by the
 * caller. c-ares does not read /etc/hosts — irrelevant for public picture
 * hosts, and one less way to point a name at a private address.
 */
/**
 * How long to keep waiting for the second address family once the first has
 * answered. Some nameservers silently drop AAAA (or A) queries; without this,
 * every fetch from a host behind one would run out the whole budget.
 */
export const DNS_SECOND_FAMILY_GRACE_MS = 300

type Settled = { ok: true; value: string[] } | { ok: false }

export function caresAvatarResolver(
  factory: DnsResolverFactory = (opts) => new Resolver(opts),
  opts: { graceMs?: number } = {},
): AvatarResolver {
  const graceMs = opts.graceMs ?? DNS_SECOND_FAMILY_GRACE_MS
  return async (host, budget) => {
    const timeout = Math.max(1, Math.floor(budget?.timeoutMs ?? AVATAR_FETCH_TIMEOUT_MS))
    const resolver = factory({ timeout, tries: 1 })
    const cancel = () => resolver.cancel()
    budget?.signal?.addEventListener('abort', cancel, { once: true })
    const settle = (p: Promise<string[]>): Promise<Settled> =>
      p.then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const }),
      )
    const byFamily: Record<4 | 6, Promise<Settled>> = {
      4: settle(resolver.resolve4(host)),
      6: settle(resolver.resolve6(host)),
    }
    const got: Partial<Record<4 | 6, Settled>> = {}
    let graceTimer: ReturnType<typeof setTimeout> | undefined
    try {
      const first = await Promise.race(
        ([4, 6] as const).map((family) => byFamily[family].then((r) => ({ family, r }))),
      )
      got[first.family] = first.r
      const otherFamily = first.family === 4 ? 6 : 4
      if (first.r.ok && first.r.value.length > 0) {
        // One family answered: give the other a short grace, then go on with
        // what we have. Whatever does arrive in time is merged and vetted
        // like the rest — a blocked record still refuses the host.
        const expired = new Promise<null>((r) => {
          graceTimer = setTimeout(() => r(null), graceMs)
        })
        const other = await Promise.race([byFamily[otherFamily], expired])
        if (other) got[otherFamily] = other
        else cancel() // drop the unanswered query rather than leave it running
      } else {
        // No usable answer yet: the other family is all there is, so wait for
        // it (the fetch's deadline still bounds this).
        got[otherFamily] = await byFamily[otherFamily]
      }
      const out: ResolvedAddress[] = []
      for (const family of [4, 6] as const) {
        const r = got[family]
        if (r?.ok) out.push(...r.value.map((address) => ({ address, family })))
      }
      if (out.length === 0) throw new Error('no A or AAAA record')
      return out
    } finally {
      clearTimeout(graceTimer)
      budget?.signal?.removeEventListener('abort', cancel)
    }
  }
}

const defaultResolver: AvatarResolver = caresAvatarResolver()

/**
 * `node:https`, connected to the vetted address. `lookup` is overridden so
 * the socket dials exactly `address`; `servername` keeps SNI (and so
 * certificate verification) on the hostname. Never follows redirects —
 * `https.request` does not — and stops reading at `maxBytes`.
 *
 * `agent: false` is load-bearing. The global agent honours
 * `NODE_USE_ENV_PROXY` + `HTTPS_PROXY`, and then sends `CONNECT host:443` to
 * the proxy and never calls `lookup` — the proxy would resolve the name
 * itself, and the pin would be gone. A fresh agent per request also means no
 * pooled keep-alive socket outlives the fetch.
 *
 * `tls.ca` exists for tests (a per-run self-signed certificate); production
 * uses the default trust store.
 */
export const createHttpsAvatarTransport = (tls: { ca?: string } = {}): AvatarTransport => ({
  url,
  address,
  family,
  signal,
  maxBytes,
}) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: 'GET',
        signal,
        agent: false,
        ...(tls.ca ? { ca: tls.ca } : {}),
        // SNI names the host (RFC 6066 forbids an IP there); certificate
        // verification follows it, so pinning the address changes nothing
        // about which certificate is accepted.
        ...(isIP(hostOf(url)) === 0 ? { servername: hostOf(url) } : {}),
        lookup: ((_host: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) => {
          if (opts?.all) cb(null, [{ address, family }])
          else cb(null, address, family)
        }) as never,
        headers: {
          accept: 'image/png, image/jpeg, image/webp',
          'user-agent': 'OpenSteward-admin-api (profile picture)',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0
        if (status !== 200) {
          // Hang up; never drain. A 404 or 3xx whose body trickles forever
          // would otherwise hold the socket for as long as the server likes.
          res.destroy()
          req.destroy()
          resolve({ status, body: Buffer.alloc(0) })
          return
        }
        const declared = Number(res.headers['content-length'])
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.destroy()
          reject(new AvatarFetchError('too_large', 'picture exceeds the size cap'))
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBytes) {
            res.destroy()
            reject(new AvatarFetchError('too_large', 'picture exceeds the size cap'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => resolve({ status, body: Buffer.concat(chunks) }))
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.end()
  })

export const httpsAvatarTransport: AvatarTransport = createHttpsAvatarTransport()

// ── The fetch ─────────────────────────────────────────────────────────────

function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '')
}

async function vetAndPin(
  host: string,
  resolve: AvatarResolver,
  budget: { timeoutMs: number; signal: AbortSignal },
): Promise<ResolvedAddress> {
  if (isIP(host) !== 0) {
    if (isBlockedAddress(host)) throw new AvatarFetchError('blocked_address', 'address is not public')
    return { address: host, family: isIP(host) }
  }
  let records: ResolvedAddress[]
  try {
    records = await resolve(host, budget)
  } catch {
    throw new AvatarFetchError('dns', 'host did not resolve')
  }
  if (records.length === 0) throw new AvatarFetchError('dns', 'host did not resolve')
  // Every record, not just the first: a round-robin that mixes a public and a
  // private address must not get the private one past the check.
  if (records.some((r) => isBlockedAddress(r.address))) {
    throw new AvatarFetchError('blocked_address', 'host resolves to a non-public address')
  }
  return records[0]!
}

/**
 * Fetch and validate a profile picture from an IdP-supplied URL. Throws
 * `AvatarFetchError` on every refusal and failure.
 */
export async function fetchIdpAvatar(
  rawUrl: string,
  opts: AvatarFetchOptions = {},
): Promise<FetchedAvatar> {
  const resolve = opts.resolve ?? defaultResolver
  const transport = opts.transport ?? httpsAvatarTransport
  const timeoutMs = opts.timeoutMs ?? AVATAR_FETCH_TIMEOUT_MS
  const maxBytes = opts.maxBytes ?? AVATAR_MAX_BYTES

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new AvatarFetchError('invalid_url', 'not a URL')
  }
  if (url.protocol !== 'https:') throw new AvatarFetchError('not_https', 'only https URLs are fetched')
  if (url.username || url.password) throw new AvatarFetchError('invalid_url', 'credentials in URL')
  if (url.port !== '' && url.port !== '443') throw new AvatarFetchError('blocked_port', 'only port 443')

  const controller = new AbortController()
  const deadlineAt = Date.now() + timeoutMs
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new AvatarFetchError('timeout', `no picture within ${timeoutMs} ms`))
    }, timeoutMs)
  })
  try {
    const attempt = (async () => {
      const pinned = await vetAndPin(hostOf(url), resolve, {
        timeoutMs: Math.max(1, deadlineAt - Date.now()),
        signal: controller.signal,
      })
      let res: { status: number; body: Buffer }
      try {
        res = await transport({ url, ...pinned, signal: controller.signal, maxBytes })
      } catch (err) {
        if (err instanceof AvatarFetchError) throw err
        throw new AvatarFetchError('network', 'request failed')
      }
      if (res.status >= 300 && res.status < 400) {
        throw new AvatarFetchError('redirect', `redirect ${res.status} not followed`)
      }
      if (res.status !== 200) throw new AvatarFetchError('http_status', `status ${res.status}`)
      const check = checkAvatarBytes(res.body)
      if (!check.ok) {
        throw new AvatarFetchError(
          check.reason === 'too_large' ? 'too_large' : 'not_image',
          check.reason === 'too_large' ? 'picture exceeds the size cap' : 'not a PNG, JPEG or WebP',
        )
      }
      return { bytes: res.body, contentType: check.contentType }
    })()
    // A late failure of the losing branch must not surface as unhandled.
    attempt.catch(() => {})
    return await Promise.race([attempt, deadline])
  } finally {
    clearTimeout(timer)
    // Every exit, not just the deadline: cancels outstanding DNS queries and
    // destroys any request or socket the transport still holds.
    controller.abort()
  }
}
