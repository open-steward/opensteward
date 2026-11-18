/**
 * Huly HTTP client.
 *
 * The REST API is the transactor's `/api/v1` (see constants.ts). The in-app
 * docs (Settings → API Tokens → "Using the REST API") say:
 *
 *   "Use your API token with the built-in REST API to query and modify
 *    workspace data. Pass the token as a Bearer token in the Authorization
 *    header."
 *   "Your workspace ID (UUID) is included in the token. Pass it as
 *    :workspaceId in the URL."
 *   GET /api/v1/find-all/:workspaceId?class=...  — "Query documents by class"
 *
 * The query string is the first-party REST client's
 * (hcengineering/huly.core packages/api-client/src/rest/rest.ts):
 *
 *   params.append('class', _class)
 *   params.append('query', JSON.stringify(query))
 *   params.append('options', JSON.stringify(options))
 *
 * and the transactor answers with the FindResult serialised by
 * `rpcJSONReplacer` (huly.core packages/rpc/src/rpc.ts): a plain JSON array,
 * or, when the result carries `total` or `lookupMap`,
 * `{ dataType: 'TotalArray', total, lookupMap, value: [...] }`.
 *
 * The server rejects a workspace id other than the token's
 * (hcengineering/platform pods/server/src/rpc.ts:
 * `if (workspaceId !== decodedToken.workspace) { sendError(res, 403, ...`).
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Minimal shape of any Huly document (huly.core packages/core/src/classes.ts `Doc`). */
export interface HulyDoc {
  _id: string
  _class: string
  space: string
  modifiedOn: number
  modifiedBy?: string
  createdBy?: string
  createdOn?: number
  [key: string]: unknown
}

/** Huly `FindOptions` fields this adapter sends (huly.core packages/core/src/storage.ts). */
export interface HulyFindOptions {
  limit?: number
  sort?: Record<string, number>
  showArchived?: boolean
}

interface TotalArray<T> {
  dataType: 'TotalArray'
  total?: number
  value: T[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** The REST base URL (`<transactor>/api/v1`) stored at connect time. */
export function apiBaseUrlOf(credentials: Credentials): string {
  const raw = credentials.extra?.['apiBaseUrl']
  const url = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : ''
  if (!url) {
    throw notSupported(
      'Huly connection has no REST API base URL (credentials.extra.apiBaseUrl, the "Base URL" under Settings → API Tokens → Using the REST API); reconnect it.',
    )
  }
  return url
}

/** The workspace UUID, read from the API token when the connection was made. */
export function workspaceIdOf(credentials: Credentials): string {
  const raw = credentials.extra?.['workspaceId']
  const ws = typeof raw === 'string' ? raw.trim() : ''
  if (!ws) {
    throw notSupported(
      'Huly connection has no workspace ID (credentials.extra.workspaceId, the workspace UUID carried in the API token); reconnect it.',
    )
  }
  return ws
}

function parseFindResult<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[]
  if (body && typeof body === 'object') {
    const obj = body as Partial<TotalArray<T>> & { error?: unknown }
    if (obj.dataType === 'TotalArray' && Array.isArray(obj.value)) return obj.value
    if (obj.error !== undefined) {
      throw new Error(`Huly find-all failed: ${JSON.stringify(obj.error)}`)
    }
  }
  throw new Error('Huly find-all returned neither an array nor a TotalArray')
}

export class HulyClient {
  private http: AxiosInstance
  readonly workspace: string
  readonly baseUrl: string

  /**
   * @param credentials  `accessToken` is the Huly API token; `extra.apiBaseUrl`
   *                     and `extra.workspaceId` are set by exchangeCredentials.
   *                     Either missing refuses with 501 before any request.
   */
  constructor(credentials: Credentials) {
    this.baseUrl = apiBaseUrlOf(credentials)
    this.workspace = workspaceIdOf(credentials)
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** GET /api/v1/find-all/:workspaceId?class=&query=&options= */
  async findAll<T extends HulyDoc = HulyDoc>(
    _class: string,
    query: Record<string, unknown> = {},
    options: HulyFindOptions = {},
  ): Promise<T[]> {
    const params: Record<string, string> = { class: _class }
    if (Object.keys(query).length > 0) params['query'] = JSON.stringify(query)
    if (Object.keys(options).length > 0) params['options'] = JSON.stringify(options)
    return withRetry(async () => {
      const { data } = await this.http.get<unknown>(
        `/find-all/${encodeURIComponent(this.workspace)}`,
        { params },
      )
      return parseFindResult<T>(data)
    })
  }
}
