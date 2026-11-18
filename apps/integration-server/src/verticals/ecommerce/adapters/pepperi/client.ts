/**
 * Pepperi REST API client.
 *
 * Auth: HTTP Basic, username `TokenAuth`, password = the account's
 * `APIToken`, plus an `X-Pepperi-ConsumerKey` header
 * (https://developer.pepperi.com/introduction/).
 *
 * Pagination: `page` / `page_size` (max 250) / `where` (SQL-style filter) /
 * `order_by` / `include_count`. `include_count=true` adds two custom
 * response headers, `X-Pepperi-Total-Records` and `X-Pepperi-Total-Pages`
 * (https://developer.pepperi.com/first-steps/retrieving-data/) — we always
 * pass it on list calls so `hasMore` can be reported honestly instead of
 * guessed from a short page.
 *
 * List responses are treated as a bare JSON array. Pepperi's interactive
 * (client-side-rendered) API reference does not expose a static example
 * body confirming this, but `include_count` reporting the total via
 * *headers* rather than a body field is the strongest available signal that
 * the body itself is not a wrapper object — verify against a live account
 * before relying on this for a resource not covered by this adapter's tests.
 *
 * Rate limits are not documented on any page this adapter's research could
 * reach; `withRetry` still backs off on 429 regardless of the exact budget.
 */
import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { DEFAULT_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ListResult<T> {
  items: T[]
  totalRecords?: number
  totalPages?: number
}

function header(res: AxiosResponse, name: string): string | undefined {
  const headers = res.headers as Record<string, unknown>
  const value = headers[name] ?? headers[name.toLowerCase()]
  return value == null ? undefined : String(value)
}

export class PepperiClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiToken = credentials.accessToken
    if (!apiToken) {
      throw new Error('PepperiClient: credentials.accessToken (APIToken) is required.')
    }
    const consumerKey = credentials.extra?.['consumerKey'] as string | undefined
    if (!consumerKey) {
      throw new Error(
        'PepperiClient: credentials.extra.consumerKey is required — ' +
          "it is the app's Consumer Key from the Pepperi developer portal, sent as " +
          'the X-Pepperi-ConsumerKey header on every request.',
      )
    }
    const baseUrl = (credentials.extra?.['baseUri'] as string | undefined) ?? DEFAULT_BASE_URL

    const basic = Buffer.from(`TokenAuth:${apiToken}`).toString('base64')
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Basic ${basic}`,
        'X-Pepperi-ConsumerKey': consumerKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * List helper for Pepperi's `page` / `page_size` pagination. Always sends
   * `include_count=true` and reads back `X-Pepperi-Total-Records` /
   * `X-Pepperi-Total-Pages` so the caller can report honest `hasMore`
   * (`currentPage * page_size < totalRecords`) instead of guessing from a
   * short page.
   */
  async list<T>(path: string, extraParams: Record<string, unknown> = {}): Promise<ListResult<T>> {
    const pageSize = Math.min((extraParams['page_size'] as number) ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const params: Record<string, unknown> = {
      ...extraParams,
      page_size: pageSize,
      include_count: true,
    }
    return withRetry(async () => {
      const res = await this.http.get<T[]>(path, { params })
      const totalRecordsHeader = header(res, 'X-Pepperi-Total-Records')
      const totalPagesHeader = header(res, 'X-Pepperi-Total-Pages')
      return {
        items: Array.isArray(res.data) ? res.data : [],
        totalRecords: totalRecordsHeader != null ? Number(totalRecordsHeader) : undefined,
        totalPages: totalPagesHeader != null ? Number(totalPagesHeader) : undefined,
      }
    })
  }
}
