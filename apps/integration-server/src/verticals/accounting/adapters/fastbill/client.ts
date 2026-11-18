import axios, { type AxiosInstance } from 'axios'
import { FASTBILL_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class FastBillClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL: `${FASTBILL_API_BASE}/`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  // FastBill uses a POST-based RPC API with HTTP Basic auth (email:apiKey)
  async request<T>(service: string, method: string, filter?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<{ RESPONSE: T }>(
        '',
        {
          SERVICE: service,
          FILTER: filter ?? {},
          LIMIT: 100,
          OFFSET: 0,
        },
        {
          auth: {
            username: this.apiKey.split(':')[0] ?? this.apiKey,
            password: this.apiKey.split(':')[1] ?? this.apiKey,
          },
        },
      )
      return data.RESPONSE
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        auth: {
          username: this.apiKey.split(':')[0] ?? this.apiKey,
          password: this.apiKey.split(':')[1] ?? this.apiKey,
        },
      })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        auth: {
          username: this.apiKey.split(':')[0] ?? this.apiKey,
          password: this.apiKey.split(':')[1] ?? this.apiKey,
        },
      })
      return data
    })
  }
}
