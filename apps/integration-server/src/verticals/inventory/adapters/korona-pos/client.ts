import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * KORONA.cloud API v3 result list envelope.
 * All paginated list endpoints return this structure.
 */
export interface KoronaResultList<T> {
  results: T[]
  currentPage: number
  pagesTotal: number
  resultsOfPage: number
  resultsTotal: number
}

export class KoronaPosClient {
  private http: AxiosInstance
  readonly accountId: string

  constructor(credentials: Credentials) {
    this.accountId = String(credentials.extra?.['accountId'] ?? '')
    if (!this.accountId) throw new Error('korona-pos requires credentials.extra.accountId')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** GET /accounts/{accountId}/{path} */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(`/accounts/${this.accountId}/${path}`, { params })
      return data
    })
  }

  /** Paginate through all pages of a list resource, up to maxPages. */
  async listAll<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
    pageSize = DEFAULT_PAGE_SIZE,
    maxPages = 50,
  ): Promise<T[]> {
    const results: T[] = []
    let page = 1
    while (page <= maxPages) {
      const res = await this.get<KoronaResultList<T>>(path, { page, size: pageSize, ...extraParams })
      results.push(...(res.results ?? []))
      if (page >= (res.pagesTotal ?? 1)) break
      page++
    }
    return results
  }
}
