import axios, { type AxiosInstance } from 'axios'
import { SMSA_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * SMSA authenticates via a `passkey` query parameter on every request.
 * No Authorization header is used.
 */
export class SmsaClient {
  private http: AxiosInstance
  private passkey: string

  constructor(credentials: Credentials) {
    this.passkey = credentials.accessToken
    this.http = axios.create({
      baseURL: SMSA_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { ...params, passkey: this.passkey },
      })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: { passkey: this.passkey },
      })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, {
        params: { passkey: this.passkey },
      })
    })
  }
}
