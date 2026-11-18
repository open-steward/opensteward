/**
 * Kore.ai HTTP client.
 *
 * Authentication:
 *   auth: <JWT>        — required header for every request
 *   accountId: <id>    — required header for every request
 *
 * Pagination (contact-center APIs): skip / limit query params;
 * response envelope: { results, skip, limit, hasMore, totalResults }
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_HOST, CC_API_PREFIX } from './constants'

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

export class KoreAiClient {
  private http: AxiosInstance
  readonly streamId: string

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    const host = extra['host'] || DEFAULT_HOST
    this.streamId = extra['streamId'] ?? ''
    const accountId = extra['accountId'] ?? ''

    this.http = axios.create({
      baseURL: host,
      headers: {
        auth: credentials.accessToken,
        accountId,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Build the full path prefix: /agentassist/api/v1/public/{streamId} */
  private prefix(): string {
    return `${CC_API_PREFIX}/${this.streamId}`
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(`${this.prefix()}${path}`, { params })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(`${this.prefix()}${path}`, body)
      return data
    })
  }
}
