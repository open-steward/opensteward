/**
 * RuntimeSettingsClient — read-side cache for admin-tunable settings.
 *
 * Lifecycle: services call `start()` at boot, which does one synchronous
 * fetch + schedules a 60-second background refresh. Hot-path code uses
 * `get<T>()` synchronously against the cache; lookup misses fall back
 * to a caller-supplied default (typically the .env value).
 *
 * The hot path (rate-limit `consume()`, auth middleware feature flags)
 * cannot afford a network round-trip, so synchronous reads are the
 * contract. Cache stays warm for `ttlMs` (default 60 s) even when
 * admin-api is unreachable.
 *
 * The setting inventory (keys, defaults, admin-UI descriptions) lives in
 * admin-api's runtime-settings-store.ts.
 */

import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { URL } from 'url'

export interface RuntimeSettingsClientOptions {
  /**
   * Base URL of admin-api (e.g. `http://admin-api:3001`). When unset,
   * the client never fetches — every read returns the supplied default.
   * Useful for tests and for deployments that haven't wired admin-api
   * yet.
   */
  adminApiUrl?: string | null
  /** Cache TTL in ms. Default 60_000. */
  ttlMs?: number
  /**
   * Shared service secret, sent as `X-Service-Secret`. admin-api checks it
   * with a constant-time compare, mirroring the `X-Admin-Secret` mechanism
   * used in the opposite direction.
   *
   * Not a bearer token: admin-api's `requireAuth` is `jwtVerify()`, so a
   * bearer would have to be a JWT signed with `JWT_SECRET` — the key that
   * signs admin user sessions. A service holding that could mint itself an
   * admin token, so this service deliberately does not have it.
   *
   * When unset the poll goes out unauthenticated and admin-api answers 401,
   * which is the pre-wiring behaviour: the cache stays empty and every read
   * falls back to its caller-supplied default.
   */
  serviceSecret?: string | null
  /** Inject logger; defaults to console. */
  logger?: { warn: (msg: string, err?: unknown) => void }
}

interface CachedSetting {
  value: unknown
  valueType: 'number' | 'boolean' | 'string' | 'json'
}

export class RuntimeSettingsClient {
  private cache = new Map<string, CachedSetting>()
  private lastRefreshedAt = 0
  private timer: NodeJS.Timeout | null = null
  private readonly ttlMs: number
  private readonly logger: NonNullable<RuntimeSettingsClientOptions['logger']>

  constructor(private readonly opts: RuntimeSettingsClientOptions) {
    this.ttlMs = opts.ttlMs ?? 60_000
    this.logger = opts.logger ?? {
      warn: (msg: string, err?: unknown) => console.warn(`[runtime-settings] ${msg}`, err ?? ''),
    }
  }

  /** One-shot initial fetch + start the refresh interval. */
  async start(): Promise<void> {
    await this.refresh()
    this.timer = setInterval(() => {
      this.refresh().catch((err) => this.logger.warn('refresh failed', err))
    }, this.ttlMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /**
   * Synchronous typed read. Returns the cached value if present and
   * type-matches; otherwise returns the supplied default.
   */
  getNumber(key: string, fallback: number): number {
    const cached = this.cache.get(key)
    if (cached && cached.valueType === 'number' && typeof cached.value === 'number') {
      return cached.value
    }
    return fallback
  }

  getBoolean(key: string, fallback: boolean): boolean {
    const cached = this.cache.get(key)
    if (cached && cached.valueType === 'boolean' && typeof cached.value === 'boolean') {
      return cached.value
    }
    return fallback
  }

  getString(key: string, fallback: string): string {
    const cached = this.cache.get(key)
    if (cached && cached.valueType === 'string' && typeof cached.value === 'string') {
      return cached.value
    }
    return fallback
  }

  /**
   * Read a JSON-typed setting. Caller supplies the expected shape via `T`;
   * the cache stores the parsed value verbatim, so the cast is structural.
   */
  getJson<T>(key: string, fallback: T): T {
    const cached = this.cache.get(key)
    if (cached && cached.valueType === 'json') {
      return cached.value as T
    }
    return fallback
  }

  /** Force a refresh (e.g. from an invalidation webhook). */
  async refresh(): Promise<void> {
    const url = this.opts.adminApiUrl
    if (!url) return // no admin-api configured; rely on fallbacks
    try {
      const rows = await this.fetchSettings(url)
      this.cache.clear()
      for (const row of rows) {
        this.cache.set(row.key, { value: row.value, valueType: row.valueType })
      }
      this.lastRefreshedAt = Date.now()
    } catch (err) {
      // Keep the existing cache; don't disturb hot-path readers.
      this.logger.warn(`fetch ${url}/api/runtime-settings failed`, err)
    }
  }

  /** Test-friendly: seed the cache without a network call. */
  setForTest(
    key: string,
    value: unknown,
    valueType: 'number' | 'boolean' | 'string' | 'json',
  ): void {
    this.cache.set(key, { value, valueType })
  }

  private fetchSettings(
    baseUrl: string,
  ): Promise<
    Array<{ key: string; value: unknown; valueType: 'number' | 'boolean' | 'string' | 'json' }>
  > {
    const u = new URL(baseUrl.replace(/\/+$/, '') + '/api/runtime-settings')
    const lib = u.protocol === 'https:' ? httpsRequest : httpRequest
    const headers: Record<string, string> = { accept: 'application/json' }
    const secret = this.opts.serviceSecret?.trim()
    if (secret) headers['x-service-secret'] = secret
    return new Promise((resolve, reject) => {
      const req = lib(
        {
          method: 'GET',
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname,
          headers,
          timeout: 5_000,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => {
            if (!res.statusCode || res.statusCode >= 400) {
              reject(new Error(`admin-api returned ${res.statusCode}`))
              return
            }
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
                data?: Array<{
                  key: string
                  value: unknown
                  valueType: 'number' | 'boolean' | 'string' | 'json'
                }>
              }
              resolve(body.data ?? [])
            } catch (e) {
              reject(e)
            }
          })
        },
      )
      req.on('timeout', () => req.destroy(new Error('admin-api fetch timeout')))
      req.on('error', reject)
      req.end()
    })
  }
}

/**
 * Convenience: a no-op client used in tests and in services that
 * haven't wired admin-api yet. Every read returns the supplied
 * default.
 */
export function nullRuntimeSettingsClient(): RuntimeSettingsClient {
  return new RuntimeSettingsClient({ adminApiUrl: null })
}
