import axios, { type AxiosInstance } from 'axios'
import { DELIVEREE_API_BASE_PRODUCTION, DELIVEREE_API_BASE_SANDBOX } from './constants'
import { authHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class DelivereeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const sandbox = credentials.extra?.sandbox === 'true'
    const baseURL = sandbox ? DELIVEREE_API_BASE_SANDBOX : DELIVEREE_API_BASE_PRODUCTION

    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}
