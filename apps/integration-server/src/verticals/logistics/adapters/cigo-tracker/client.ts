import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { CIGO_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const ae = err as AxiosError
      if (ae.response?.status === 429 && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** The API Account ID, the Basic-auth username. A connection without one cannot authenticate. */
export function cigoAccountId(credentials: Credentials): string {
  const id = credentials.extra?.['accountId']
  if (typeof id !== 'string' || id === '') {
    throw new Error(
      'CIGO Tracker credentials lack the API Account ID (extra.accountId); reconnect.',
    )
  }
  return id
}

/**
 * CIGO Tracker Public API client.
 *
 * Authentication is HTTP Basic, the spec's only security scheme (`BasicAuth`,
 * `scheme: basic`): "The **Account ID** serves as the `username` and the
 * **Auth Key** serves as the `password` combination for your Basic Auth
 * headers." The Account ID is stored in credentials.extra.accountId and the
 * Auth Key as credentials.accessToken.
 */
export class CigoTrackerClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const basic = Buffer.from(`${cigoAccountId(credentials)}:${credentials.accessToken}`).toString(
      'base64',
    )
    this.http = axios.create({
      baseURL: CIGO_API_BASE,
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => (await this.http.put<T>(path, body)).data)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => (await this.http.patch<T>(path, body)).data)
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => (await this.http.delete<T>(path)).data)
  }
}
