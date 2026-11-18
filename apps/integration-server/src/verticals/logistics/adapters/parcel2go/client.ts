import axios, { type AxiosInstance } from 'axios'
import { PARCEL2GO_API_BASE, PARCEL2GO_SANDBOX_API_BASE } from './constants'
import { authHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class Parcel2GoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const sandbox = Boolean(credentials.extra?.['sandbox'])
    const baseURL = sandbox ? PARCEL2GO_SANDBOX_API_BASE : PARCEL2GO_API_BASE

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
