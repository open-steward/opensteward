import axios, { type AxiosInstance } from 'axios'
import { DUETT_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class DuettClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // Duett uses two API key headers instead of Bearer token auth:
    //   accessToken  = X-Api-Integration-Key (constant per integration)
    //   tenantId     = X-Api-Client-Key (per end-user company instance)
    this.http = axios.create({
      baseURL: DUETT_API_BASE,
      headers: {
        'X-Api-Integration-Key': credentials.accessToken,
        'X-Api-Client-Key': credentials.tenantId ?? '',
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
