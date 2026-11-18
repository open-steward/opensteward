/**
 * Server-side fetcher for the host's public branding.
 *
 * Hits admin-api's `GET /api/company-info/public` over the Docker network
 * (or whatever ADMIN_API_URL points at) and caches the response in-process
 * for `cacheMs` (default 60s) so a busy `/connect/:token` page doesn't
 * hammer admin-api.
 *
 * Returns a fully-populated record with nullable fields — never throws.
 * If admin-api is unreachable, returns the empty defaults so the page
 * still renders, just without branding.
 */

export interface HostBranding {
  name: string | null
  logoDataUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
  fontFamily: string | null
  fontDataUrl: string | null
  fontUrl: string | null
  faviconDataUrl: string | null
  /** White-label: when true, suppress the default OpenSteward mark/wordmark
   *  fallbacks (an explicit logo/name still renders). */
  hideAttribution: boolean
  supportEmail: string | null
  privacyPolicyUrl: string | null
  termsOfServiceUrl: string | null
  baseUrl: string | null
}

const EMPTY: HostBranding = {
  name: null,
  logoDataUrl: null,
  primaryColor: null,
  secondaryColor: null,
  fontFamily: null,
  fontDataUrl: null,
  fontUrl: null,
  faviconDataUrl: null,
  hideAttribution: false,
  supportEmail: null,
  privacyPolicyUrl: null,
  termsOfServiceUrl: null,
  baseUrl: null,
}

export interface HostInfoFetcherOptions {
  /** Base URL of admin-api. Defaults to `process.env['ADMIN_API_URL']`. */
  adminApiUrl?: string
  /** Cache TTL in milliseconds. Default 60_000 (1 min). */
  cacheMs?: number
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch
}

export class HostInfoFetcher {
  private url: string | null
  private cacheMs: number
  private fetchImpl: typeof fetch
  private cached: { value: HostBranding; expiresAt: number } | null = null

  constructor(opts?: HostInfoFetcherOptions) {
    const url = opts?.adminApiUrl ?? process.env['ADMIN_API_URL'] ?? null
    this.url = url ? url.replace(/\/$/, '') : null
    this.cacheMs = opts?.cacheMs ?? 60_000
    this.fetchImpl = opts?.fetchImpl ?? globalThis.fetch
  }

  async get(): Promise<HostBranding> {
    if (!this.url) return EMPTY

    const now = Date.now()
    if (this.cached && this.cached.expiresAt > now) return this.cached.value

    try {
      const res = await this.fetchImpl(`${this.url}/api/company-info/public`, {
        headers: { accept: 'application/json' },
      })
      if (!res.ok) {
        // Cache the failure for a short window to avoid hot-loop retries.
        this.cached = { value: EMPTY, expiresAt: now + Math.min(this.cacheMs, 5_000) }
        return EMPTY
      }
      const body = (await res.json()) as { data?: Partial<HostBranding> }
      const value: HostBranding = { ...EMPTY, ...(body.data ?? {}) }
      this.cached = { value, expiresAt: now + this.cacheMs }
      return value
    } catch {
      this.cached = { value: EMPTY, expiresAt: now + Math.min(this.cacheMs, 5_000) }
      return EMPTY
    }
  }

  /** Drop the cached value — used by tests / explicit refresh from admin UI. */
  invalidate(): void {
    this.cached = null
  }
}
