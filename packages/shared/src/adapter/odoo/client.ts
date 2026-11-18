/**
 * One Odoo client for every vertical, over the two external APIs Odoo documents.
 *
 * ── JSON-2 (Odoo 19+) ───────────────────────────────────────────────────────
 * https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
 *   "New in version 19.0."
 *   "Post a JSON object at the /json/2/<model>/<method> URL."
 *   Autorization: "Required, bearer followed by an API key."
 *   X-Odoo-Database: "Optional, the name of the database to connect to."
 *   "All the arguments are named; there is no way in JSON-2 to call a function
 *    with positional arguments."
 *   "In case of error, a 4xx/5xx status with a JSON-serialized error object in
 *    the body." (`name`, `message`, `arguments`, `context`, `debug`)
 *
 * ── External RPC (Odoo 14–18, and still on 19) ─────────────────────────────
 * https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
 *   "uid = common.authenticate(db, username, password, {})"
 *   "Each call to execute_kw takes the following parameters: the database to use,
 *    a string / the user id (retrieved through authenticate), an integer / the
 *    user's password, a string / the model name, a string / the method name, a
 *    string / an array/list of parameters passed by position / a mapping/dict of
 *    parameters to pass by keyword (optional)"
 *   API keys, "New in version 14.0.": "The way to use API Keys in your scripts is
 *    to simply replace your password by the key. The login remains in-use."
 *   "Both the XML-RPC and JSON-RPC APIs at endpoints /xmlrpc , /xmlrpc/2 and
 *    /jsonrpc are scheduled for removal in Odoo 22 (fall 2028) and Online 21.1
 *    (winter 2027)."
 * The page shows XML-RPC and says "JSON-RPC would be similar". The JSON-RPC
 * route is `@route('/jsonrpc', type='json', auth="none")` with parameters
 * `service, method, args` in odoo 14.0 and 17.0 (odoo/addons/base/controllers/
 * rpc.py) and 19.0 (addons/rpc/controllers/jsonrpc.py). Its envelope is the
 * JsonRPCDispatcher docstring in odoo/http.py:
 *   --> {"jsonrpc": "2.0", "method": "call", "params": {"arg1": "val1" }, "id": null}
 *   <-- {"jsonrpc": "2.0", "error": {"code": 1, "message": "…", "data": {…}}, "id": null}
 * where `data` is serialize_exception(exc), whose `name` is
 * `f'{module}.{name}'` of the Python exception. `common.authenticate` returns
 * `False` on AccessDenied (odoo/service/common.py, 14.0–19.0).
 *
 * ── Version ─────────────────────────────────────────────────────────────────
 * The connection chooses (`extra.apiVersion`: 'json2' | 'rpc'). Nothing is
 * probed: the customer knows which Odoo they run, and a wrong guess would send
 * the API key to an endpoint that is not going to read it.
 */
import { createHash } from 'node:crypto'
import { assertPublicHost } from '../../net/safe-fetch'
import { withRetry } from '../../http/with-retry'
import type { Credentials } from '../../auth/store'

export type OdooApiVersion = 'json2' | 'rpc'
export const ODOO_API_VERSIONS: readonly OdooApiVersion[] = ['json2', 'rpc']

/** A search domain: a list of `[field, operator, value]` criteria (and operators). */
export type OdooDomain = unknown[]

export interface OdooSearchReadOptions {
  domain: OdooDomain
  fields: string[]
  /** "offset – number of results to ignore (default: none)" (19.0 ORM reference, Model.search) */
  offset?: number
  /** "limit – maximum number of records to return (default: all)" (19.0 ORM reference, Model.search) */
  limit?: number
  /** "order – sort string" */
  order?: string
}

export interface OdooPage<T> {
  rows: T[]
  /** `search_count` over the same domain, or offset + rows on a short page. Absent when unknown. */
  totalCount?: number
  hasMore: boolean
}

/** Stable default order for offset paging: without one a page can shift between calls. */
export const ODOO_PAGE_ORDER = 'id asc'

export interface OdooConnection {
  baseUrl: string
  apiVersion: OdooApiVersion
  apiKey: string
  database?: string
  login?: string
}

/**
 * An Odoo refusal, mapped onto the codes the adapter error handler relays.
 * `statusCode` is ours (deliberate); `upstreamStatus` is Odoo's HTTP status.
 */
export class OdooError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly odooName?: string
  readonly upstreamStatus?: number
  /** Duck-typed by withRetry: a 429 is retried with backoff. */
  readonly response?: { status: number }

  constructor(
    message: string,
    opts: { statusCode: number; code: string; odooName?: string; upstreamStatus?: number },
  ) {
    super(message)
    this.name = 'OdooError'
    this.statusCode = opts.statusCode
    this.code = opts.code
    if (opts.odooName !== undefined) this.odooName = opts.odooName
    if (opts.upstreamStatus !== undefined) {
      this.upstreamStatus = opts.upstreamStatus
      if (opts.upstreamStatus === 429) this.response = { status: 429 }
    }
  }
}

function reconnect(what: string): OdooError {
  return new OdooError(
    `Odoo connection has no ${what}; reconnect it with the Odoo URL, API version, database, login and API key.`,
    { statusCode: 401, code: 'UNAUTHORIZED' },
  )
}

/**
 * JSON-2 status → our code. The statuses are Odoo's own: odoo/exceptions.py
 * (19.0) gives AccessDenied and AccessError `http_status = 403`, MissingError
 * `404`, LockError `409`, UserError (and so ValidationError) `422`; json2.py
 * raises NotFound for an unknown model or method and UnprocessableEntity for
 * bad arguments; a bad key is the documented `401 … "Invalid apikey"`.
 */
const JSON2_STATUS: Record<number, [number, string]> = {
  401: [401, 'UNAUTHORIZED'],
  403: [403, 'FORBIDDEN'],
  404: [404, 'NOT_FOUND'],
  409: [409, 'CONFLICT'],
  422: [422, 'VALIDATION'],
  429: [429, 'RATE_LIMITED'],
}

/**
 * RPC fault `data.name` → our code. Names are `f'{module}.{name}'` of the
 * classes in odoo/exceptions.py; ValidationError subclasses UserError.
 */
const RPC_FAULT: Record<string, [number, string]> = {
  'odoo.exceptions.AccessDenied': [401, 'UNAUTHORIZED'],
  'odoo.exceptions.AccessError': [403, 'FORBIDDEN'],
  'odoo.exceptions.MissingError': [404, 'NOT_FOUND'],
  'odoo.exceptions.LockError': [409, 'CONFLICT'],
  'odoo.exceptions.ValidationError': [422, 'VALIDATION'],
  'odoo.exceptions.UserError': [422, 'VALIDATION'],
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Read the connection the shared Odoo form stored. Throws a reconnect error on the old shapes. */
export function readOdooConnection(credentials: Credentials): OdooConnection {
  const extra = credentials.extra ?? {}
  const baseUrl = asString(extra['baseUrl'])
  if (!baseUrl) throw reconnect('Odoo URL')
  const apiVersion = extra['apiVersion']
  if (apiVersion !== 'json2' && apiVersion !== 'rpc') throw reconnect('API version')
  const apiKey = asString(credentials.accessToken)
  if (!apiKey) throw reconnect('API key')
  const database = asString(extra['database'])
  const login = asString(extra['login'])
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiVersion,
    apiKey,
    ...(database ? { database } : {}),
    ...(login ? { login } : {}),
  }
}

/**
 * Odoo's datetime wire format: "YYYY-MM-DD HH:MM:SS for Datetime fields", and a
 * string "must be UTC-only" (ORM reference, 19.0, Date(time) Fields).
 */
export function odooDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

// uid per (server, database, login, key). The key is hashed so it is not a map key.
const uidCache = new Map<string, number>()
const UID_CACHE_MAX = 1000

/** Test hook. */
export function _resetOdooUidCache(): void {
  uidCache.clear()
  fieldCache.clear()
}

// Field names per (connection, model), from fields_get. Bounded like uidCache.
const fieldCache = new Map<string, ReadonlySet<string>>()
const FIELD_CACHE_MAX = 1000

let rpcId = 0

export class OdooClient {
  readonly connection: OdooConnection

  constructor(credentials: Credentials) {
    this.connection = readOdooConnection(credentials)
  }

  // ── Generic ORM methods, one shape per transport ──────────────────────────

  /** `search_read`: "equivalent to a search() followed by a read()". */
  async searchRead<T>(model: string, opts: OdooSearchReadOptions): Promise<T[]> {
    const kw: Record<string, unknown> = { fields: await this.fieldsOf(model, opts.fields) }
    if (opts.offset !== undefined) kw['offset'] = opts.offset
    if (opts.limit !== undefined) kw['limit'] = opts.limit
    if (opts.order !== undefined) kw['order'] = opts.order
    const rows = await this.call(
      model,
      'search_read',
      { domain: opts.domain, ...kw },
      [opts.domain],
      kw,
    )
    if (!Array.isArray(rows)) throw this.malformed(model, 'search_read', rows)
    return rows as T[]
  }

  /** `search_count`: "takes the same domain filter as search() and no other parameter". */
  async searchCount(model: string, domain: OdooDomain): Promise<number> {
    const n = await this.call(model, 'search_count', { domain }, [domain], {})
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
      throw this.malformed(model, 'search_count', n)
    }
    return n
  }

  /** `read(fields)` on `ids`. An id that does not exist is absent from the result. */
  async read<T>(model: string, ids: number[], wanted: string[]): Promise<T[]> {
    const fields = await this.fieldsOf(model, wanted)
    const rows = await this.call(model, 'read', { ids, fields }, [ids], { fields })
    if (!Array.isArray(rows)) throw this.malformed(model, 'read', rows)
    return rows as T[]
  }

  /**
   * The subset of `wanted` that `model` has on this server. Field sets differ
   * between Odoo versions (res.partner has `mobile` up to 18.0 and not in
   * 19.0; account.account has `deprecated` up to 18.0 and `active` from 19.0),
   * and Odoo refuses a read that names a field the model lacks:
   * `raise ValueError(f"Invalid field {field_name!r} on {self._name!r}")`
   * (odoo/orm/models.py 19.0, _determine_fields_to_fetch). So every read asks
   * only for fields the server reports, once per connection and model:
   *   "fields_get() can be used to inspect a model's fields and check which
   *    ones seem to be of interest." (19.0 external_rpc_api, List record fields)
   * A field the server lacks is simply absent from the rows.
   */
  async fieldsOf(model: string, wanted: string[]): Promise<string[]> {
    const key = `${this.cacheKey()}\u0000${model}`
    let known = fieldCache.get(key)
    if (!known) {
      const attributes = ['type']
      const out = await this.call(model, 'fields_get', { attributes }, [], { attributes })
      if (!out || typeof out !== 'object' || Array.isArray(out)) {
        throw this.malformed(model, 'fields_get', out)
      }
      known = new Set(Object.keys(out))
      if (fieldCache.size >= FIELD_CACHE_MAX) fieldCache.clear()
      fieldCache.set(key, known)
    }
    const have = known
    return wanted.filter((f) => have.has(f))
  }

  /**
   * `create(vals_list)`. JSON-2 serialises the returned recordset as its ids
   * (json2.py: `if isinstance(result, BaseModel): result = result.ids`); RPC
   * "creates a single record and returns its database identifier".
   */
  async create(model: string, values: Record<string, unknown>): Promise<number> {
    const out = await this.call(model, 'create', { vals_list: [values] }, [values], {})
    const id = Array.isArray(out) ? out[0] : out
    if (typeof id !== 'number') throw this.malformed(model, 'create', out)
    return id
  }

  /** `write(vals)` on `ids`. */
  async write(model: string, ids: number[], values: Record<string, unknown>): Promise<boolean> {
    return (await this.call(model, 'write', { ids, vals: values }, [ids, values], {})) === true
  }

  /** `unlink()` on `ids`. */
  async unlink(model: string, ids: number[]): Promise<boolean> {
    return (await this.call(model, 'unlink', { ids }, [ids], {})) === true
  }

  /**
   * One offset page of `search_read`, ordered by id unless told otherwise.
   * "offset and limit parameters are available to only retrieve a subset of all
   * matched records"; a full page asks `search_count` for the total, a short
   * page is the end.
   *
   * The RPC page warns: "Calling search then search_count (or the other way
   * around) may not yield coherent results if other users are using the
   * server". A write between the two calls can make the total off by the
   * rows that changed; it cannot repeat or skip a row within a page, since
   * the rows come from one search_read in id order.
   */
  async searchPage<T>(
    model: string,
    opts: OdooSearchReadOptions & { offset: number; limit: number },
  ): Promise<OdooPage<T>> {
    const rows = await this.searchRead<T>(model, { order: ODOO_PAGE_ORDER, ...opts })
    if (rows.length < opts.limit) {
      return {
        rows,
        hasMore: false,
        ...(rows.length > 0 || opts.offset === 0 ? { totalCount: opts.offset + rows.length } : {}),
      }
    }
    const totalCount = await this.searchCount(model, opts.domain)
    return { rows, totalCount, hasMore: opts.offset + rows.length < totalCount }
  }

  // ── Transports ────────────────────────────────────────────────────────────

  /**
   * Call `model.method`. `named` is the JSON-2 body; `args`/`kw` are the RPC
   * execute_kw positional and keyword arguments for the same call.
   */
  async call(
    model: string,
    method: string,
    named: Record<string, unknown>,
    args: unknown[],
    kw: Record<string, unknown>,
  ): Promise<unknown> {
    await this.assertHost()
    return withRetry(() =>
      this.connection.apiVersion === 'json2'
        ? this.json2(model, method, named)
        : this.executeKw(model, method, args, kw),
    )
  }

  private async assertHost(): Promise<void> {
    const host = new URL(this.connection.baseUrl).hostname.replace(/^\[|\]$/g, '')
    await assertPublicHost(host)
  }

  private async post(
    path: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<Response> {
    try {
      return await fetch(`${this.connection.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'application/json',
          'User-Agent': 'OpenSteward',
          ...headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
        // Never follow: a 307/308 would replay the body (on RPC it carries the
        // API key) to a host assertPublicHost never saw.
        redirect: 'manual',
      })
    } catch (err) {
      const timeout =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      throw new OdooError(
        `Odoo at ${this.connection.baseUrl} ${timeout ? 'did not answer in time' : 'could not be reached'}`,
        {
          statusCode: timeout ? 504 : 502,
          code: timeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE',
        },
      )
    }
  }

  /** A 3xx is refused, not followed (see post). */
  private refuseRedirect(res: Response): void {
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      throw new OdooError(
        `Odoo at ${this.connection.baseUrl} answered with a redirect (${res.status}${location ? ` to ${location}` : ''}); reconnect with the address Odoo is served at.`,
        { statusCode: 502, code: 'UPSTREAM_ERROR', upstreamStatus: res.status },
      )
    }
  }

  private async json2(
    model: string,
    method: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: `bearer ${this.connection.apiKey}` }
    if (this.connection.database) headers['X-Odoo-Database'] = this.connection.database
    const res = await this.post(
      `/json/2/${encodeURIComponent(model)}/${encodeURIComponent(method)}`,
      headers,
      body,
    )
    this.refuseRedirect(res)
    const text = await res.text()
    if (!res.ok) {
      let name: string | undefined
      let message = text.slice(0, 500)
      try {
        const err = JSON.parse(text) as { name?: unknown; message?: unknown }
        if (typeof err.name === 'string') name = err.name
        if (typeof err.message === 'string') message = err.message
      } catch {
        // not JSON: keep the text
      }
      const [statusCode, code] = JSON2_STATUS[res.status] ?? [502, 'UPSTREAM_ERROR']
      throw new OdooError(`Odoo ${model}/${method} failed (${res.status}): ${message}`, {
        statusCode,
        code,
        upstreamStatus: res.status,
        ...(name ? { odooName: name } : {}),
      })
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw this.malformed(model, method, text.slice(0, 100))
    }
  }

  /** POST /jsonrpc {service, method, args}; returns `result` or throws the mapped fault. */
  private async jsonrpc(
    service: string,
    method: string,
    args: unknown[],
    what: string,
  ): Promise<unknown> {
    const res = await this.post(
      '/jsonrpc',
      {},
      {
        jsonrpc: '2.0',
        method: 'call',
        params: { service, method, args },
        id: ++rpcId,
      },
    )
    this.refuseRedirect(res)
    const text = await res.text()
    if (!res.ok) {
      const [statusCode, code] = JSON2_STATUS[res.status] ?? [502, 'UPSTREAM_ERROR']
      throw new OdooError(`Odoo ${what} failed (${res.status}): ${text.slice(0, 500)}`, {
        statusCode,
        code,
        upstreamStatus: res.status,
      })
    }
    let envelope: {
      result?: unknown
      error?: { code?: unknown; message?: unknown; data?: { name?: unknown; message?: unknown } }
    }
    try {
      envelope = JSON.parse(text) as typeof envelope
    } catch {
      throw new OdooError(`Odoo ${what} answered with something other than JSON-RPC`, {
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
        upstreamStatus: res.status,
      })
    }
    if (envelope.error) {
      const name =
        typeof envelope.error.data?.name === 'string' ? envelope.error.data.name : undefined
      const message =
        typeof envelope.error.data?.message === 'string'
          ? envelope.error.data.message
          : String(envelope.error.message ?? 'error')
      const [statusCode, code] =
        (name ? RPC_FAULT[name] : undefined) ??
        (envelope.error.code === 404 ? [404, 'NOT_FOUND'] : [502, 'UPSTREAM_ERROR'])
      throw new OdooError(`Odoo ${what} failed: ${message}`, {
        statusCode,
        code,
        ...(name ? { odooName: name } : {}),
      })
    }
    return envelope.result
  }

  private cacheKey(): string {
    const c = this.connection
    const key = createHash('sha256').update(c.apiKey).digest('hex')
    return [c.baseUrl, c.database ?? '', c.login ?? '', key].join('\u0000')
  }

  private async uid(): Promise<number> {
    const { database, login, apiKey } = this.connection
    if (!database) throw reconnect('database (the External RPC API needs one)')
    if (!login) throw reconnect('login (the External RPC API needs one)')
    const cacheKey = this.cacheKey()
    const cached = uidCache.get(cacheKey)
    if (cached !== undefined) return cached
    const uid = await this.jsonrpc(
      'common',
      'authenticate',
      [database, login, apiKey, {}],
      'authenticate',
    )
    if (typeof uid !== 'number' || !Number.isInteger(uid) || uid <= 0) {
      throw new OdooError(
        'Odoo refused the login and API key (authenticate returned no user id).',
        {
          statusCode: 401,
          code: 'UNAUTHORIZED',
        },
      )
    }
    if (uidCache.size >= UID_CACHE_MAX) uidCache.clear()
    uidCache.set(cacheKey, uid)
    return uid
  }

  private async executeKw(
    model: string,
    method: string,
    args: unknown[],
    kw: Record<string, unknown>,
  ): Promise<unknown> {
    const uid = await this.uid()
    try {
      return await this.jsonrpc(
        'object',
        'execute_kw',
        [this.connection.database, uid, this.connection.apiKey, model, method, args, kw],
        `${model}/${method}`,
      )
    } catch (err) {
      // A revoked or expired key: forget the uid so the next call re-authenticates.
      if (err instanceof OdooError && err.code === 'UNAUTHORIZED') uidCache.delete(this.cacheKey())
      throw err
    }
  }

  private malformed(model: string, method: string, got: unknown): OdooError {
    return new OdooError(
      `Odoo ${model}/${method} returned ${JSON.stringify(got)?.slice(0, 100)}, which is not its documented shape`,
      {
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      },
    )
  }
}
