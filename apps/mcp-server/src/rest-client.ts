/**
 * Thin axios wrapper around the integration-server's `/v1/...` REST
 * surface. The MCP server is a translator — every tool call lands
 * here as a single HTTP request.
 *
 * Tenant mode targets:
 *   GET /v1/customers
 *   GET /v1/customers/:id
 *   GET /v1/customers/:id/connections
 *   GET /v1/{vertical}/{resource}?connection_id=<uuid>&...
 *   GET /v1/{vertical}/{resource}/:id?connection_id=<uuid>
 *
 * End-user mode targets `/v1/me/*` instead. The client exposes a
 * `mode` field so callers pick paths without a second client.
 */
import axios, { type AxiosInstance, type AxiosResponse, isAxiosError } from 'axios'
import { z } from 'zod'

export type ClientMode = 'tenant' | 'end-user'

export interface ClientOptions {
  baseUrl: string
  token: string
  mode: ClientMode
  /** axios timeout (ms). Default 30s. */
  timeoutMs?: number
}

export interface ListParams {
  connection_id: string
  limit?: number
  page?: number
  offset?: number
  since?: string
  status?: string
  [extra: string]: string | number | undefined
}

/**
 * Turn an error response body into something an agent can act on.
 *
 * The previous version only handled `error` as an OBJECT — the `{code, message}`
 * shape the auth middleware emits. Every resource router replies with a flat
 * STRING instead (`{ error: 'Not implemented' }`), so the overwhelming majority
 * of failures were flattened to a bare `HTTP 501` and the server's own
 * explanation was discarded before the agent ever saw it.
 *
 * Both shapes are handled now, and the structured one keeps its `code` in the
 * text so an agent can distinguish "wrong vertical for this connection — never
 * call this again" from "unmapped for this platform — may work later", plus any
 * upstream detail the server chose to relay.
 */
/**
 * Fold the server's cache status into the response envelope's `meta`.
 *
 * `X-OpenSteward-Cache` (`hit` / `miss` / `live` / `passthrough`) and
 * `X-OpenSteward-Synced-At` were both discarded — `request()` returned
 * `res.data` and nothing else — so an agent had no way to tell a cached answer
 * from a live one.
 *
 * That is not idle information. The raw-payload policy is a live runtime
 * setting and a cached row belongs to whichever policy was in force when it was
 * written, so the same record can legitimately answer two ways depending on
 * whether the cache was warm. `status: "hit"` with a `syncedAt` is the whole
 * explanation, and without it the difference is unattributable.
 *
 * Placed in `meta` beside the `platform` and `fetchedAt` the server already
 * sends, so an agent reads one envelope rather than two channels. A body that
 * carries no `meta` is left exactly as it is — inventing one would change the
 * shape of every non-envelope response.
 */
export function attachCacheMeta(data: unknown, headers: Record<string, unknown>): unknown {
  const status = headers['x-opensteward-cache']
  if (typeof status !== 'string' || !status) return data
  if (!data || typeof data !== 'object') return data

  const meta = (data as { meta?: unknown }).meta
  if (!meta || typeof meta !== 'object') return data

  const syncedAt = headers['x-opensteward-synced-at']
  const reason = headers['x-opensteward-cache-reason']
  const ageSeconds = headers['x-opensteward-cache-age']
  const cache: { status: string; reason?: string; syncedAt?: string; ageSeconds?: number } = { status }
  // `status` alone cannot tell a disabled cache from a cold one, an expired
  // entry, or a deliberate bypass — all four read as `miss`, which is how
  // three review rounds concluded "the cache never hits" from probes that all
  // carried `limit` and so bypassed it by design.
  if (typeof reason === 'string' && reason) cache.reason = reason
  if (typeof syncedAt === 'string' && syncedAt) cache.syncedAt = syncedAt
  if (typeof ageSeconds === 'string' && ageSeconds !== '' && !isNaN(Number(ageSeconds))) {
    cache.ageSeconds = Number(ageSeconds)
  }

  return { ...(data as Record<string, unknown>), meta: { ...(meta as Record<string, unknown>), cache } }
}

export function extractErrorMessage(data: unknown, status: number): string {
  const fallback = `HTTP ${status}`
  if (typeof data === 'string') return data.trim() || fallback
  if (!data || typeof data !== 'object') return fallback

  const err = (data as { error?: unknown }).error
  if (typeof err === 'string') return err.trim() || fallback

  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown; upstreamStatus?: unknown; upstreamBody?: unknown }
    const parts: string[] = []
    if (typeof e.code === 'string') parts.push(e.code)
    if (typeof e.message === 'string') parts.push(e.message)
    if (typeof e.upstreamStatus === 'number') parts.push(`upstream status ${e.upstreamStatus}`)
    if (typeof e.upstreamBody === 'string' && e.upstreamBody) parts.push(`upstream body: ${e.upstreamBody}`)
    if (parts.length) return parts.join(' — ')
    return JSON.stringify(err)
  }

  return fallback
}

export class RestClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly upstreamBody?: unknown,
  ) {
    super(message)
    this.name = 'RestClientError'
  }
}

const DEFAULT_CAPABILITIES_TIMEOUT_MS = 5_000
const CapabilitiesBody = z.object({ data: z.object({ verticals: z.array(z.string()) }) })

export class RestClient {
  private readonly http: AxiosInstance
  readonly mode: ClientMode

  constructor(opts: ClientOptions) {
    this.mode = opts.mode
    this.http = axios.create({
      baseURL: opts.baseUrl.replace(/\/+$/, ''),
      timeout: opts.timeoutMs ?? 30_000,
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: 'application/json',
        'User-Agent': '@opensteward/mcp-server',
      },
      // We never want axios to throw for 4xx — we map them ourselves.
      validateStatus: () => true,
    })
  }

  private async request<T = unknown>(method: 'GET', url: string, params?: Record<string, unknown>): Promise<T> {
    let res: AxiosResponse
    try {
      res = await this.http.request({ method, url, params })
    } catch (err) {
      if (isAxiosError(err)) {
        throw new RestClientError(
          err.message || 'Network error',
          0,
          url,
          undefined,
        )
      }
      throw err
    }
    if (res.status >= 200 && res.status < 300)
      return attachCacheMeta(res.data, (res.headers ?? {}) as Record<string, unknown>) as T
    throw new RestClientError(extractErrorMessage(res.data, res.status), res.status, url, res.data)
  }

  // ── Tenant-mode customer endpoints ─────────────────────────────────────

  listCustomers(params?: { q?: string; limit?: number; offset?: number }): Promise<unknown> {
    if (this.mode !== 'tenant') throw new Error('listCustomers is only available in tenant mode')
    return this.request('GET', '/v1/customers', params as Record<string, unknown> | undefined)
  }

  getCustomer(customerId: string): Promise<unknown> {
    if (this.mode !== 'tenant') throw new Error('getCustomer is only available in tenant mode')
    return this.request('GET', `/v1/customers/${encodeURIComponent(customerId)}`)
  }

  listCustomerConnections(customerId: string): Promise<unknown> {
    if (this.mode !== 'tenant') throw new Error('listCustomerConnections is only available in tenant mode')
    return this.request('GET', `/v1/customers/${encodeURIComponent(customerId)}/connections`)
  }

  // ── End-user mode customer endpoints (/v1/me/*) ────────────────────────

  getMe(params?: { include_pii?: boolean }): Promise<unknown> {
    if (this.mode !== 'end-user') throw new Error('getMe is only available in end-user mode')
    // The endpoint reads `?include_pii=true` as a string and refuses the
    // reveal without `mcp:read_pii` on the token, so only send the param
    // when it was actually asked for.
    const query = params?.include_pii ? { include_pii: 'true' } : undefined
    return this.request('GET', '/v1/me', query)
  }

  listMyConnections(): Promise<unknown> {
    if (this.mode !== 'end-user') throw new Error('listMyConnections is only available in end-user mode')
    return this.request('GET', '/v1/me/connections')
  }

  // ── Resource endpoints (per-vertical, per-resource) ────────────────────
  //
  // Tenant mode:   /v1/{vertical}/{resource}
  // End-user mode: /v1/me/{vertical}/{resource}
  // The connection_id query param is always present; the server-side
  // middleware constrains the bearer's reach via either tenant ownership
  // (tenant mode) or end-user ownership (end-user mode).

  private resourcePrefix(): string {
    return this.mode === 'end-user' ? '/v1/me' : '/v1'
  }

  listResource(vertical: string, resourcePath: string, params: ListParams): Promise<unknown> {
    const url = `${this.resourcePrefix()}/${vertical}/${resourcePath}`
    return this.request('GET', url, params as Record<string, unknown>)
  }

  getResource(vertical: string, resourcePath: string, id: string, connectionId: string): Promise<unknown> {
    const url = `${this.resourcePrefix()}/${vertical}/${resourcePath}/${encodeURIComponent(id)}`
    return this.request('GET', url, { connection_id: connectionId })
  }

  /**
   * Sanity-probe the supplied token against a cheap read endpoint so
   * the MCP server fails fast at boot if the key is invalid, revoked,
   * or carries a write scope (a write-scoped key is silently rejected
   * — this MCP is read-only).
   */
  async validateToken(): Promise<void> {
    if (this.mode === 'tenant') {
      await this.listCustomers({ limit: 1 })
    } else {
      // end-user mode probes its own /me record.
      await this.request('GET', '/v1/me')
    }
  }

  /**
   * The verticals the deployment serves this token. `undefined` = the deployment
   * does not answer the question (404: an older release; a 2xx of another shape:
   * a proxy page or catch-all) — "unknown", never "none", or every resource tool
   * would vanish. Throws on anything else (network failure or timeout: status 0;
   * 401/403; 5xx) so the caller can say why. The timeout is short on purpose:
   * this runs before the agent connects.
   */
  async getCapabilities(opts: { timeoutMs?: number } = {}): Promise<string[] | undefined> {
    const url = this.mode === 'end-user' ? '/v1/me/capabilities' : '/v1/capabilities'
    let res: AxiosResponse
    try {
      res = await this.http.request({
        method: 'GET',
        url,
        timeout: opts.timeoutMs ?? DEFAULT_CAPABILITIES_TIMEOUT_MS,
      })
    } catch (err) {
      if (isAxiosError(err))
        throw new RestClientError(err.message || 'Network error', 0, url, undefined)
      throw err
    }
    if (res.status === 404) return undefined
    if (res.status < 200 || res.status >= 300) {
      throw new RestClientError(
        extractErrorMessage(res.data, res.status),
        res.status,
        url,
        res.data,
      )
    }
    const parsed = CapabilitiesBody.safeParse(res.data)
    return parsed.success ? parsed.data.data.verticals : undefined
  }
}
