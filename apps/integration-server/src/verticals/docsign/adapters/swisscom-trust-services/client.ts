/**
 * Swisscom Trust Services — AIS REST/JSON client.
 *
 * AIS is a transaction API, not a CRUD API: there is no pagination and there
 * are no list endpoints. Two POST endpoints exist:
 *
 *   POST ${baseUrl}/AIS-Server/rs/v1.0/sign      — submit a SignRequest
 *   POST ${baseUrl}/AIS-Server/rs/v1.0/pending   — poll an async transaction
 *
 * Auth is `Authorization: Bearer <token>` (OAuth2 client-credentials). The
 * per-customer base URL (prod vs test) lives on `credentials.extra.baseUrl`.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, DEFAULT_BASE_URL, PENDING_PATH, SIGN_PATH } from './constants'

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

export class SwisscomTrustServicesClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? DEFAULT_BASE_URL)
    this.http = axios.create({
      baseURL: `${baseUrl}/AIS-Server/rs/${API_VERSION}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json;charset=UTF-8',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Submit a SignRequest. Returns the SignResponse envelope. */
  async sign<T>(body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(SIGN_PATH, body)
      return data
    })
  }

  /** Poll a pending async transaction by its ResponseID. Returns SignResponse. */
  async pending<T>(body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(PENDING_PATH, body)
      return data
    })
  }
}
