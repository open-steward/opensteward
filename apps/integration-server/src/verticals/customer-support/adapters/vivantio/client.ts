/**
 * Vivantio HTTP client.
 *
 * Auth: Authorization: Basic <base64(username:password)>
 * All mutating requests and most queries use POST with a JSON body
 * containing a SelectPageRequest or similar.
 *
 * Pagination: offset-based via PageNumber + PageSize in the request body.
 * Response envelope: { Results: T[], RecordCount: number, Successful: boolean, ErrorMessages: ... }
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_DEFAULT, API_PATH_PREFIX } from './constants'

export interface SelectPageRequest {
  PageSize: number
  PageNumber: number
  OrderBy?: string
  Ascending?: boolean
  Query?: {
    Mode: number   // 0 = MatchAny
    Items?: unknown[] | null
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 ||
          (status !== undefined && status >= 500 && status < 600)) &&
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

export class VivantioClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL =
      (credentials.extra?.['apiBaseUrl'] as string | undefined)?.trim() ||
      API_BASE_URL_DEFAULT

    this.http = axios.create({
      baseURL: `${baseURL}${API_PATH_PREFIX}`,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * POST to a Vivantio SELECT endpoint with a SelectPageRequest body.
   * Returns the full response envelope.
   */
  async selectPage<T>(path: string, req: SelectPageRequest): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, req)
      return data
    })
  }

  /**
   * POST to a Vivantio endpoint expecting a single-item response.
   */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body ?? {})
      return data
    })
  }
}
