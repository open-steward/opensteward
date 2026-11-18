import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { DEFAULT_API_BASE_URL } from './constants'

/**
 * Thin HTTP client for the Vikunja REST API (v1).
 *
 * Authentication: `Authorization: Bearer <token>` header.
 * The base URL is configurable for self-hosted instances; it defaults to the
 * public try instance (`https://try.vikunja.io/api/v1`). A custom base URL
 * may be stored in `credentials.extra.baseUrl`.
 *
 * Pagination: list endpoints accept `page` (1-based) and `per_page`. Callers
 * pass these as regular query params.
 */
export class VikunjaClient {
  private http: AxiosInstance

  /** The instance's API root; identifies the account a connection belongs to. */
  readonly baseUrl: string

  constructor(credentials: Credentials) {
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined)?.replace(/\/$/, '') ??
      DEFAULT_API_BASE_URL
    this.baseUrl = baseUrl

    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
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

  /**
   * GET one page of a paginated list, with the `x-pagination-total-pages`
   * header Vikunja's generic list handler sets on every paginated response
   * (`undefined` when the header is absent or not a number).
   */
  async getPage<T>(
    path: string,
    params: Record<string, unknown>,
  ): Promise<{ data: T; totalPages: number | undefined }> {
    return withRetry(async () => {
      const res = await this.http.get<T>(path, { params })
      const raw: unknown = (res.headers as Record<string, unknown> | undefined)?.[
        'x-pagination-total-pages'
      ]
      const n = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN
      return { data: res.data, totalPages: Number.isFinite(n) ? n : undefined }
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}
