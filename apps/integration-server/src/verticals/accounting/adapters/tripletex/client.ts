import axios, { type AxiosInstance } from 'axios'
import { TRIPLETEX_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class TripletexClient {
  private http: AxiosInstance

  // accessToken is already the Basic auth value: base64(0:{sessionToken})
  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${TRIPLETEX_API_BASE}/`,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
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

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }
}
