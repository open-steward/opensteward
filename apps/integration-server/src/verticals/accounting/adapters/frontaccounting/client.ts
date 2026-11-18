import axios, { type AxiosInstance } from 'axios'
import { FRONTACCOUNTING_DEFAULT_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class FrontAccountingClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseUrl?: string) {
    this.http = axios.create({
      baseURL: baseUrl ?? FRONTACCOUNTING_DEFAULT_BASE,
      params: { token: credentials.accessToken },
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(resource: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>('', { params: { resource, ...params } })
      return data
    })
  }
}
