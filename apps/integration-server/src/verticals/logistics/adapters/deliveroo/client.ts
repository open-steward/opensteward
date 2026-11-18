import axios, { type AxiosInstance } from 'axios'
import { DELIVEROO_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class DeliverooClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: DELIVEROO_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
    return withRetry(async () => {
      const headers: Record<string, string> = {}
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
      const { data } = await this.http.post<T>(path, body, { headers })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
