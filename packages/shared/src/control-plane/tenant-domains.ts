/**
 * Server-side resolver for the deployment's custom domain → tenant map.
 *
 * Mirrors `HostInfoFetcher`: integration-server hits admin-api's
 * `GET /api/tenant-domains/public` over the Docker network (ADMIN_API_URL) and
 * caches the result in-process for `cacheMs` (default 60s) so the per-request
 * Host→tenant lookup is a cheap cache hit.
 *
 * Fail-soft: if admin-api is unreachable, or no domains are configured, every
 * host resolves to `DEFAULT_TENANT` — preserving single-tenant deployments that
 * never configure a custom domain.
 *
 * Bounded: every request awaits this lookup, so a fetch that hangs (admin-api
 * not started yet, a host that drops packets) would hang every request with it.
 * The fetch is cut off after `timeoutMs`, and concurrent callers share one
 * in-flight fetch rather than each opening their own.
 *
 * Branding is deliberately NOT part of this map (it stays deployment-global via
 * company-info); this resolver carries only `(domain, tenantId)` pairs.
 */

export const DEFAULT_TENANT = 'default'

export interface TenantDomainEntry {
  domain: string
  tenantId: string
}

export interface TenantDomainFetcherOptions {
  /** Base URL of admin-api. Defaults to `process.env['ADMIN_API_URL']`. */
  adminApiUrl?: string
  /** Cache TTL in milliseconds. Default 60_000 (1 min). */
  cacheMs?: number
  /** Give up on admin-api after this many milliseconds. Default 2_000. */
  timeoutMs?: number
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch
}

interface Resolved {
  /** domain → tenantId, for O(1) host resolution. */
  byDomain: Map<string, string>
  /** Stable (sorted) entry list, for picking a tenant's primary domain. */
  entries: TenantDomainEntry[]
}

const EMPTY: Resolved = { byDomain: new Map(), entries: [] }

export class TenantDomainFetcher {
  private url: string | null
  private cacheMs: number
  private timeoutMs: number
  private fetchImpl: typeof fetch
  private cached: { value: Resolved; expiresAt: number } | null = null
  private inflight: Promise<Resolved> | null = null

  constructor(opts?: TenantDomainFetcherOptions) {
    const url = opts?.adminApiUrl ?? process.env['ADMIN_API_URL'] ?? null
    this.url = url ? url.replace(/\/$/, '') : null
    this.cacheMs = opts?.cacheMs ?? 60_000
    this.timeoutMs = opts?.timeoutMs ?? 2_000
    this.fetchImpl = opts?.fetchImpl ?? globalThis.fetch
  }

  private load(): Promise<Resolved> {
    if (!this.url) return Promise.resolve(EMPTY)
    if (this.cached && this.cached.expiresAt > Date.now()) return Promise.resolve(this.cached.value)
    this.inflight ??= this.fetchMap(this.url).finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async fetchMap(url: string): Promise<Resolved> {
    const now = Date.now()
    try {
      const res = await this.fetchImpl(`${url}/api/tenant-domains/public`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!res.ok) {
        this.cached = { value: EMPTY, expiresAt: now + Math.min(this.cacheMs, 5_000) }
        return EMPTY
      }
      const body = (await res.json()) as { data?: TenantDomainEntry[] }
      const raw = Array.isArray(body.data) ? body.data : []
      // Keep only well-formed pairs; lowercase the domain to match how the
      // resolver receives request.hostname.
      const entries = raw
        .filter((e) => e && typeof e.domain === 'string' && typeof e.tenantId === 'string')
        .map((e) => ({ domain: e.domain.toLowerCase(), tenantId: e.tenantId }))
        .sort((a, b) => a.domain.localeCompare(b.domain))
      const byDomain = new Map(entries.map((e) => [e.domain, e.tenantId]))
      const value: Resolved = { byDomain, entries }
      this.cached = { value, expiresAt: now + this.cacheMs }
      return value
    } catch {
      this.cached = { value: EMPTY, expiresAt: now + Math.min(this.cacheMs, 5_000) }
      return EMPTY
    }
  }

  /** Resolve a request hostname to its tenant, or `DEFAULT_TENANT` when the host
   *  is unknown / unconfigured / admin-api is unreachable. */
  async resolve(hostname: string): Promise<string> {
    if (!hostname) return DEFAULT_TENANT
    const { byDomain } = await this.load()
    return byDomain.get(hostname.toLowerCase()) ?? DEFAULT_TENANT
  }

  /** The primary domain for a tenant (first in stable alphabetical order), or
   *  null when the tenant has no custom domain. Used to build Connect Link URLs
   *  on the tenant's own domain. */
  async domainForTenant(tenantId: string): Promise<string | null> {
    if (!tenantId || tenantId === DEFAULT_TENANT) return null
    const { entries } = await this.load()
    return entries.find((e) => e.tenantId === tenantId)?.domain ?? null
  }

  /** Drop the cached value — used by tests / explicit refresh. */
  invalidate(): void {
    this.cached = null
  }
}
