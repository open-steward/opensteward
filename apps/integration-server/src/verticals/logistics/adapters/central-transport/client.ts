/**
 * Central Transport HTTP client.
 *
 * Wraps axios with:
 *  - `X-API-KEY` authentication header (Piyovi API)
 *  - Automatic retry with exponential back-off on 429 / 5xx responses
 *  - JSON Content-Type / Accept headers
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { CENTRAL_TRANSPORT_API_BASE } from './constants'
import { apiKeyHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

function isRetryable(err: unknown): boolean {
  const axErr = err as AxiosError
  const status = axErr?.response?.status
  return status === 429 || (typeof status === 'number' && status >= 500)
}

export class CentralTransportClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseURL: string = CENTRAL_TRANSPORT_API_BASE) {
    this.http = axios.create({
      baseURL,
      headers: {
        'X-API-KEY': apiKeyHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      try {
        const { data } = await this.http.get<T>(path, { params })
        return data
      } catch (err) {
        if (!isRetryable(err)) throw err
        throw err
      }
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      try {
        const { data } = await this.http.post<T>(path, body)
        return data
      } catch (err) {
        if (!isRetryable(err)) throw err
        throw err
      }
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      try {
        const { data } = await this.http.put<T>(path, body)
        return data
      } catch (err) {
        if (!isRetryable(err)) throw err
        throw err
      }
    })
  }
}
