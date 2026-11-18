/**
 * Scoro HTTP client.
 *
 * All Scoro API v2 calls are HTTP POST with a JSON body that contains:
 *   - apiKey              (from credentials.accessToken)
 *   - company_account_id  (from credentials.extra.companyAccountId)
 *   - lang                (defaults to "eng")
 *   - per_page / page     (pagination)
 *   - request             (module-specific filter/payload)
 *
 * Rate limits: 10–80 req / 2 s window; 50k–1M req / day.
 * Retry on 429 and 5xx with exponential back-off.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl } from './constants'

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

export interface ScoroListResponse<T> {
  status: string
  statusCode: number
  messages?: Record<string, unknown>
  data?: T[]
  page?: number
  pages?: number
  per_page?: number
  total?: number
}

export interface ScoroSingleResponse<T> {
  status: string
  statusCode: number
  messages?: Record<string, unknown>
  data?: T
}

export class ScoroClient {
  private http: AxiosInstance
  private apiKey: string
  private companyAccountId: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.companyAccountId = String(credentials.extra?.['companyAccountId'] ?? '')
    const baseURL = buildBaseUrl(this.companyAccountId)

    this.http = axios.create({
      baseURL,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /** Build the common auth block included in every request body. */
  private authBody(): Record<string, unknown> {
    return {
      apiKey: this.apiKey,
      company_account_id: this.companyAccountId,
      lang: 'eng',
    }
  }

  /**
   * POST to `/{module}/list` with pagination.
   * Returns the `data` array or an empty array on empty results.
   */
  async list<T>(
    module: string,
    page = 1,
    perPage = 50,
    request?: Record<string, unknown>,
    filter?: Record<string, unknown>,
  ): Promise<{ items: T[]; pages: number }> {
    return withRetry(async () => {
      const body: Record<string, unknown> = {
        ...this.authBody(),
        per_page: perPage,
        page,
      }
      if (request) body['request'] = request
      if (filter) body['filter'] = filter

      const { data } = await this.http.post<ScoroListResponse<T>>(`/${module}/list`, body)
      return {
        items: data.data ?? [],
        pages: data.pages ?? 1,
      }
    })
  }

  /**
   * POST to `/{module}/view/{id}`.
   * Returns the single data object.
   */
  async view<T>(module: string, id: string | number): Promise<T | undefined> {
    return withRetry(async () => {
      const { data } = await this.http.post<ScoroSingleResponse<T>>(`/${module}/view/${id}`, {
        ...this.authBody(),
      })
      return data.data
    })
  }
}
