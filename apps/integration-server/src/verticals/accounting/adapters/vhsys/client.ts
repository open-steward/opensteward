/**
 * vhsys HTTP client.
 *
 * Authentication uses two custom headers per request:
 *   access-token        — stored in credentials.accessToken
 *   secret-access-token — stored in credentials.extra.secretAccessToken
 *
 * The API returns enveloped JSON:
 *   { code: number, status: string, data: T }
 * Helper `unwrap()` peels the envelope so callers receive `T` directly.
 */
import axios, { type AxiosInstance } from 'axios'
import { VHSYS_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

interface VhsysEnvelope<T> {
  code: number
  status: string
  data: T
}

export class VhsysClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const secretAccessToken =
      typeof credentials.extra?.['secretAccessToken'] === 'string'
        ? credentials.extra['secretAccessToken']
        : ''
    this.http = axios.create({
      baseURL: VHSYS_API_BASE,
      headers: {
        'access-token': credentials.accessToken,
        'secret-access-token': secretAccessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<VhsysEnvelope<T>>(path, { params })
      return data.data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<VhsysEnvelope<T>>(path, body)
      return data.data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<VhsysEnvelope<T>>(path, body)
      return data.data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
