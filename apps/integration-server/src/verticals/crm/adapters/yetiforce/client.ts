import { createHash } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'

/**
 * YetiForce Webservice Premium client.
 *
 * Spec: https://doc.yetiforce.com/api/7x/WebservicePremium.json (the OpenAPI
 * the Swagger UI at doc.yetiforce.com/api/ loads). Base path
 * `{instanceUrl}/webservice/WebservicePremium`, as in the spec's own example
 * "__CRM_URL__/webservice/WebservicePremium/Users/Login".
 *
 * Auth (https://doc.yetiforce.com/en/developer-guides/api/first-connect/):
 *   - `X-API-KEY`: "The value is the API Key copied from the YetiForce system."
 *   - `Authorization`: "Credentials in the format Basic base64(userName:password),
 *     where userName and password are the credentials of the application
 *     registered to use the API ... (from the Web service - applications panel)".
 *   - POST Users/Login with `{ userName, password }` ("the data set in the
 *     administration section in the Web service - users tab") returns
 *     `result.token`; "add the x-token header with the value of the obtained
 *     token to subsequent requests". The spec's security for RecordsList,
 *     Record and Fields is basicAuth + ApiKeyAuth (X-API-KEY) + token (X-TOKEN).
 *
 * Every response is `{ status: 1|0, result | error }` ("1 - success , 0 - error").
 */

export interface YetiForceSession {
  token: string
  /** `preferences.raw_time_zone`: "System main time zone (data in database format)". */
  rawTimeZone: string
}

export interface RecordsPage {
  /** `result.rawData`, in response order, keyed by record id. */
  rows: Array<[string, Record<string, unknown>]>
  /** `result.isMorePages`: "There are more pages". */
  isMorePages: boolean
  rawTimeZone: string
}

interface Envelope {
  status?: unknown
  result?: unknown
  error?: { message?: unknown; code?: unknown }
}

function fail(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode })
}

/** Sessions by connection, so a walk does not log in once per page. */
const sessions = new Map<string, Promise<YetiForceSession>>()

/** Exported for tests: forget every cached session. */
export function _resetYetiForceSessions(): void {
  sessions.clear()
}

export class YetiForceClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly basic: string
  private readonly userName: string
  private readonly password: string
  private readonly sessionKey: string

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const text = (k: string): string =>
      typeof extra[k] === 'string' ? (extra[k] as string).trim() : ''
    const instanceUrl = text('instanceUrl').replace(/\/+$/, '')
    const appName = text('appName')
    const appPassword =
      typeof extra['appPassword'] === 'string' ? (extra['appPassword'] as string) : ''
    const userName = text('userName')
    const password = typeof extra['password'] === 'string' ? (extra['password'] as string) : ''
    const missing = [
      ['instanceUrl', instanceUrl],
      ['API key', credentials.accessToken],
      ['appName', appName],
      ['appPassword', appPassword],
      ['userName', userName],
      ['password', password],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k)
    if (missing.length > 0) {
      throw fail(
        `YetiForce needs ${missing.join(', ')}: reconnect with the instance URL, the Web service - applications key, name and password, and a Web service - users login`,
        401,
      )
    }
    this.baseUrl = `${instanceUrl}/webservice/WebservicePremium`
    this.apiKey = credentials.accessToken
    this.basic = `Basic ${Buffer.from(`${appName}:${appPassword}`).toString('base64')}`
    this.userName = userName
    this.password = password
    this.sessionKey = createHash('sha256')
      .update([instanceUrl, this.apiKey, appName, appPassword, userName, password].join('\u0000'))
      .digest('hex')
  }

  private baseHeaders(): Record<string, string> {
    return {
      'X-API-KEY': this.apiKey,
      Authorization: this.basic,
      Accept: 'application/json',
    }
  }

  private async send(
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: unknown,
  ): Promise<{ status: number; json: Envelope }> {
    const res = await fetch(`${this.baseUrl}/${path}`, {
      method,
      headers: body !== undefined ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text().catch(() => '')
    let json: Envelope = {}
    try {
      json = text ? (JSON.parse(text) as Envelope) : {}
    } catch {
      json = {}
    }
    return { status: res.status, json }
  }

  private static check(status: number, json: Envelope, what: string): unknown {
    if (status >= 200 && status < 300 && json.status === 1) return json.result
    const code =
      typeof json.error?.code === 'number' ? json.error.code : status >= 400 ? status : 502
    const message = typeof json.error?.message === 'string' ? json.error.message : `HTTP ${status}`
    throw fail(`YetiForce ${what} failed (${code}): ${message}`, code)
  }

  private async login(): Promise<YetiForceSession> {
    const { status, json } = await this.send('POST', 'Users/Login', this.baseHeaders(), {
      userName: this.userName,
      password: this.password,
    })
    const result = YetiForceClient.check(status, json, 'Users/Login') as
      Record<string, unknown> | undefined
    const token = result?.['token']
    const prefs = result?.['preferences'] as Record<string, unknown> | undefined
    const rawTimeZone = prefs?.['raw_time_zone']
    if (typeof token !== 'string' || token === '')
      throw fail('YetiForce Users/Login returned no token', 502)
    if (typeof rawTimeZone !== 'string' || rawTimeZone === '') {
      throw fail('YetiForce Users/Login returned no preferences.raw_time_zone', 502)
    }
    return { token, rawTimeZone }
  }

  private session(): Promise<YetiForceSession> {
    let s = sessions.get(this.sessionKey)
    if (!s) {
      s = this.login()
      sessions.set(this.sessionKey, s)
      s.catch(() => {
        if (sessions.get(this.sessionKey) === s) sessions.delete(this.sessionKey)
      })
    }
    return s
  }

  /**
   * One authenticated call. A 401 ("No sent token, Invalid token, Token has
   * expired") drops the cached session and logs in again, once.
   */
  private async call(
    method: string,
    path: string,
    headers: Record<string, string>,
    what: string,
    body?: unknown,
  ): Promise<{ result: unknown; session: YetiForceSession }> {
    for (let attempt = 0; ; attempt++) {
      const pending = this.session()
      const session = await pending
      const { status, json } = await this.send(
        method,
        path,
        { ...this.baseHeaders(), 'X-TOKEN': session.token, ...headers },
        body,
      )
      if (status === 401 && attempt === 0) {
        if (sessions.get(this.sessionKey) === pending) sessions.delete(this.sessionKey)
        continue
      }
      return { result: YetiForceClient.check(status, json, what), session }
    }
  }

  /**
   * GET {moduleName}/RecordsList, one offset page.
   *
   * Headers per the spec: `x-row-limit` ("Get rows limit, default: 100"),
   * `x-row-offset` ("Offset, default: 0"), `x-raw-data` ("Get additional raw
   * data"), `x-fields` ("JSON array in the list of fields to be returned in
   * response") and `x-order-by` ("Set the sorted results by columns [Json
   * format]"). Rows are sorted by id so an offset names the same row on every
   * call; the server accepts `id` there by name
   * (api/webservice/WebserviceStandard/BaseModule/RecordsList.php:
   * `'id' === $fieldName`).
   */
  async recordsList(
    module: string,
    fields: readonly string[],
    limit: number,
    offset: number,
  ): Promise<RecordsPage> {
    const { result, session } = await this.call(
      'GET',
      `${encodeURIComponent(module)}/RecordsList`,
      {
        'x-row-limit': String(limit),
        'x-row-offset': String(offset),
        'x-raw-data': '1',
        'x-fields': JSON.stringify(fields),
        'x-order-by': JSON.stringify({ id: 'ASC' }),
      },
      `${module}/RecordsList`,
    )
    const r = (result ?? {}) as Record<string, unknown>
    if (typeof r['isMorePages'] !== 'boolean') {
      throw fail(`YetiForce ${module}/RecordsList returned no isMorePages`, 502)
    }
    const raw = r['rawData']
    const rows: Array<[string, Record<string, unknown>]> =
      raw !== null && typeof raw === 'object' && !Array.isArray(raw)
        ? Object.entries(raw as Record<string, Record<string, unknown>>)
        : []
    return { rows, isMorePages: r['isMorePages'], rawTimeZone: session.rawTimeZone }
  }

  /** GET {moduleName}/Record/{recordId} with `x-raw-data: 1`: `result.id` and `result.rawData`. */
  async record(
    module: string,
    id: string,
  ): Promise<{ id: string; raw: Record<string, unknown>; rawTimeZone: string }> {
    const { result, session } = await this.call(
      'GET',
      `${encodeURIComponent(module)}/Record/${encodeURIComponent(id)}`,
      { 'x-raw-data': '1' },
      `${module}/Record`,
    )
    const r = (result ?? {}) as Record<string, unknown>
    const rawData = r['rawData']
    if (rawData === null || typeof rawData !== 'object' || Array.isArray(rawData)) {
      throw fail(`YetiForce ${module}/Record returned no rawData`, 502)
    }
    const recordId = r['id']
    if (typeof recordId !== 'number' && typeof recordId !== 'string') {
      throw fail(`YetiForce ${module}/Record returned no id`, 502)
    }
    return {
      id: String(recordId),
      raw: rawData as Record<string, unknown>,
      rawTimeZone: session.rawTimeZone,
    }
  }

  /** GET {moduleName}/Fields: `result.fields`, keyed by field name. */
  async fields(module: string): Promise<Record<string, Record<string, unknown>>> {
    const { result } = await this.call(
      'GET',
      `${encodeURIComponent(module)}/Fields`,
      {},
      `${module}/Fields`,
    )
    const f = ((result ?? {}) as Record<string, unknown>)['fields']
    if (f === null || typeof f !== 'object' || Array.isArray(f)) {
      throw fail(`YetiForce ${module}/Fields returned no fields`, 502)
    }
    return f as Record<string, Record<string, unknown>>
  }

  // ── Write paths: out of this rebuild's scope, unchanged apart from auth ──

  async post<T>(module: string, body: unknown): Promise<{ result: T; rawTimeZone: string }> {
    const { result, session } = await this.call('POST', module, {}, `POST ${module}`, body)
    return { result: result as T, rawTimeZone: session.rawTimeZone }
  }

  async put<T>(
    module: string,
    id: string,
    body: unknown,
  ): Promise<{ result: T; rawTimeZone: string }> {
    const { result, session } = await this.call('PUT', `${module}/${id}`, {}, `PUT ${module}`, body)
    return { result: result as T, rawTimeZone: session.rawTimeZone }
  }

  async delete(module: string, id: string): Promise<void> {
    await this.call('DELETE', `${module}/${id}`, {}, `DELETE ${module}`)
  }
}
