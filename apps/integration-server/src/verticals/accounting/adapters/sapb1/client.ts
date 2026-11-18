import axios, { type AxiosInstance } from 'axios'
import { SAP_B1_SERVICE_LAYER_PATH } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class SapB1Client {
  private http: AxiosInstance

  /** The Service Layer host (host[:port]) lives on the connection, set by the Connect Link form. */
  constructor(credentials: Credentials) {
    const host = credentials.extra?.['host']
    if (typeof host !== 'string' || !host) {
      throw new Error(
        'SAP Business One connection is missing its Service Layer host; reconnect it and enter the Service Layer URL.',
      )
    }
    this.http = axios.create({
      baseURL: `https://${host}${SAP_B1_SERVICE_LAYER_PATH}/`,
      headers: {
        Cookie: `B1SESSION=${credentials.accessToken}`,
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
