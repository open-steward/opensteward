/**
 * A small client for the Apache Superset REST API, used for two things:
 *
 *   - admin-api mints short-lived **guest tokens** for embedded dashboards
 *     (`POST /api/v1/security/guest_token/`), each carrying an RLS clause
 *     built from the viewer's tenant scope (see `superset-rls.ts`);
 *   - the superset-bootstrap job (`src/scripts/superset-bootstrap.ts`)
 *     creates the database connection, datasets and embedded configurations.
 *
 * Both authenticate as one Superset **service account** (a database user in
 * Superset's own user table, `provider: db`). Login returns a JWT access
 * token; Superset's API also enforces Flask-WTF CSRF on writes, so after
 * login the client fetches `/api/v1/security/csrf_token/` and replays its
 * token (`X-CSRFToken`) and session cookie on every request. The session is
 * cached until shortly before the access token's `exp`, logins are
 * single-flight, and a 401 drops the session and retries once.
 *
 * The feature is off unless `SUPERSET_URL` is set (`resolveSupersetConfig`).
 */

export interface SupersetConfig {
  /** Internal URL admin-api (and the bootstrap job) call Superset on. */
  url: string
  /** Browser-facing URL the admin UI embeds (iframe `src`, CSP `frame-src`). */
  publicUrl: string
  serviceUsername: string
  servicePassword: string
}

/** Strip trailing slashes; null for an unset or non-http(s) value. */
export function normaliseBaseUrl(raw: string | undefined | null): string | null {
  const v = (raw ?? '').trim().replace(/\/+$/, '')
  if (!v) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return v
  } catch {
    return null
  }
}

/**
 * Superset settings, or null when the feature is off (no usable
 * `SUPERSET_URL`). `SUPERSET_PUBLIC_URL` defaults to the internal URL, which
 * is only right when both are the same host (local dev). The caller reads
 * the variables (`config.ts`), so `.env.example` generation sees them.
 */
export function resolveSupersetConfig(raw: {
  url?: string
  publicUrl?: string
  serviceUsername?: string
  servicePassword?: string
}): SupersetConfig | null {
  const url = normaliseBaseUrl(raw.url)
  if (!url) return null
  return {
    url,
    publicUrl: normaliseBaseUrl(raw.publicUrl) ?? url,
    serviceUsername: (raw.serviceUsername ?? '').trim(),
    servicePassword: raw.servicePassword ?? '',
  }
}

export class SupersetHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
  ) {
    super(message)
    this.name = 'SupersetHttpError'
  }
}

export interface GuestTokenUser {
  username: string
  first_name: string
  last_name: string
}

export interface GuestTokenRequest {
  user: GuestTokenUser
  resources: Array<{ type: 'dashboard'; id: string }>
  rls: Array<{ clause: string; dataset?: number }>
}

export interface SupersetClientOptions {
  url: string
  username: string
  password: string
  /** Per-request timeout. Default 15 s. */
  timeoutMs?: number
  /** Session lifetime when the access token carries no `exp`. Default 5 min. */
  fallbackTtlMs?: number
  fetchImpl?: typeof fetch
  now?: () => number
}

interface Session {
  accessToken: string
  csrfToken: string | null
  cookie: string | null
  expiresAt: number
}

/** Refresh this long before the access token's `exp`. */
const EXPIRY_SKEW_MS = 30_000

/** Seconds-since-epoch `exp` of a JWT, or null. Never verifies — only schedules a refresh. */
export function jwtExpiry(token: string): number | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const json = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { exp?: unknown }
    return typeof json.exp === 'number' && Number.isFinite(json.exp) ? json.exp : null
  } catch {
    return null
  }
}

/** `name=value` pairs of every Set-Cookie header, joined for a Cookie header. */
function cookiesFrom(headers: Headers): string | null {
  const list =
    typeof (headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as { getSetCookie: () => string[] }).getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie')!]
        : []
  const pairs = list.map((c) => c.split(';')[0]!.trim()).filter((c) => c.includes('='))
  return pairs.length > 0 ? pairs.join('; ') : null
}

export class SupersetClient {
  private readonly base: string
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly timeoutMs: number
  private readonly fallbackTtlMs: number
  private session: Session | null = null
  private pending: Promise<Session> | null = null

  constructor(private readonly opts: SupersetClientOptions) {
    const base = normaliseBaseUrl(opts.url)
    if (!base) throw new Error('SupersetClient: url must be an http(s) URL')
    this.base = base
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.now = opts.now ?? Date.now
    this.timeoutMs = opts.timeoutMs ?? 15_000
    this.fallbackTtlMs = opts.fallbackTtlMs ?? 5 * 60_000
  }

  get baseUrl(): string {
    return this.base
  }

  /** Forget the cached session (the next call logs in again). */
  invalidate(): void {
    this.session = null
  }

  /** True when `GET /health` answers 2xx. Never throws. */
  async health(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.base}/health`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      return res.ok
    } catch {
      return false
    }
  }

  private async readBody(res: Response): Promise<unknown> {
    const text = await res.text()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  private async login(): Promise<Session> {
    if (!this.opts.username || !this.opts.password) {
      throw new SupersetHttpError(
        0,
        null,
        'Superset service account is not configured (SUPERSET_SERVICE_USERNAME / SUPERSET_SERVICE_PASSWORD).',
      )
    }
    const res = await this.fetchImpl(`${this.base}/api/v1/security/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        username: this.opts.username,
        password: this.opts.password,
        provider: 'db',
        refresh: false,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    const body = (await this.readBody(res)) as { access_token?: unknown } | null
    if (!res.ok || typeof body?.access_token !== 'string') {
      throw new SupersetHttpError(res.status, body, `Superset login failed (${res.status})`)
    }
    const accessToken = body.access_token
    const exp = jwtExpiry(accessToken)
    const expiresAt = (exp !== null ? exp * 1000 : this.now() + this.fallbackTtlMs) - EXPIRY_SKEW_MS

    // CSRF token + the session cookie it is bound to. Tolerate a Superset
    // with CSRF off (WTF_CSRF_ENABLED = False): no token, no header.
    let csrfToken: string | null = null
    let cookie: string | null = cookiesFrom(res.headers)
    try {
      const c = await this.fetchImpl(`${this.base}/api/v1/security/csrf_token/`, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (c.ok) {
        const cb = (await this.readBody(c)) as { result?: unknown } | null
        if (typeof cb?.result === 'string') csrfToken = cb.result
        cookie = cookiesFrom(c.headers) ?? cookie
      }
    } catch {
      /* no CSRF token — writes will fail loudly if Superset wants one */
    }
    return { accessToken, csrfToken, cookie, expiresAt }
  }

  private async ensureSession(): Promise<Session> {
    if (this.session && this.session.expiresAt > this.now()) return this.session
    if (!this.pending) {
      this.pending = this.login()
        .then((s) => {
          this.session = s
          return s
        })
        .finally(() => {
          this.pending = null
        })
    }
    return this.pending
  }

  /**
   * An authenticated JSON request. Throws `SupersetHttpError` on a non-2xx
   * answer; a 401 re-logs in and retries once.
   */
  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    return this.send<T>(method, path, body === undefined ? undefined : { json: body })
  }

  /** An authenticated multipart POST (e.g. `/api/v1/dashboard/import/`). */
  async upload<T = unknown>(path: string, form: FormData): Promise<T> {
    return this.send<T>('POST', path, { form })
  }

  private async send<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    payload: { json: unknown } | { form: FormData } | undefined,
  ): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = await this.ensureSession()
      const headers: Record<string, string> = {
        authorization: `Bearer ${s.accessToken}`,
        accept: 'application/json',
        // Flask-WTF's strict-SSL check compares the Referer with the host on
        // HTTPS; sending the base URL satisfies it.
        referer: `${this.base}/`,
      }
      let body: string | FormData | undefined
      if (payload && 'json' in payload) {
        headers['content-type'] = 'application/json'
        body = JSON.stringify(payload.json)
      } else if (payload) {
        body = payload.form // fetch sets the multipart boundary itself
      }
      if (s.csrfToken) headers['x-csrftoken'] = s.csrfToken
      if (s.cookie) headers['cookie'] = s.cookie
      const res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      const parsed = await this.readBody(res)
      if (res.status === 401 && attempt === 0) {
        this.invalidate()
        continue
      }
      if (!res.ok) {
        const msg =
          parsed && typeof parsed === 'object' && 'message' in parsed
            ? JSON.stringify((parsed as { message: unknown }).message)
            : `HTTP ${res.status}`
        throw new SupersetHttpError(res.status, parsed, `Superset ${method} ${path}: ${msg}`)
      }
      return parsed as T
    }
    /* c8 ignore next */
    throw new SupersetHttpError(401, null, `Superset ${method} ${path}: unauthorized`)
  }

  /** Mint a guest token for one embedded dashboard. */
  async createGuestToken(
    req: GuestTokenRequest,
  ): Promise<{ token: string; expiresAt: number | null }> {
    const body = await this.request<{ token?: unknown }>(
      'POST',
      '/api/v1/security/guest_token/',
      req,
    )
    if (typeof body?.token !== 'string' || !body.token) {
      throw new SupersetHttpError(200, body, 'Superset returned no guest token')
    }
    const exp = jwtExpiry(body.token)
    return { token: body.token, expiresAt: exp !== null ? exp * 1000 : null }
  }
}
