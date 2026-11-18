/**
 * Document360 HTTP client.
 *
 * Auth: `api_token` header (static API token, project-scoped).
 * Base URL: https://apihub.document360.io/v2
 *
 * Response envelope: { success, data, errors[], warnings[], information[] }
 * All reads unwrap `data`; errors surface as thrown exceptions.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE } from './constants'

/** Standard Document360 API response envelope. */
export interface D360Envelope<T> {
  success: boolean
  data: T
  errors: Array<{ description?: string; error_code?: string }>
  warnings: unknown[]
  information: unknown[]
}

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

export class Document360Client {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE,
      headers: {
        // Document360 uses `api_token` header (not Bearer)
        api_token: credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * GET a path and return the response body exactly as documented. The body
   * itself is the envelope: `{ result, success, ... }` for GET /v2/Teams and
   * GET /v2/Teams/{userId}, `{ data, success, ... }` for GET /v2/ProjectVersions
   * (https://apihub.document360.io/swagger/v2/swagger.json).
   */
  async getBody<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  /** GET a path; returns the raw response envelope so callers can inspect .data. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<D360Envelope<T>> {
    return withRetry(async () => {
      const { data } = await this.http.get<D360Envelope<T>>(path, { params })
      return data
    })
  }
}
