import axios, { type AxiosInstance } from 'axios'
import { getManagerioApiBase } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class ManagerioClient {
  private http: AxiosInstance

  /**
   * The API endpoint is per customer and lives on the connection
   * (`extra.instanceUrl`, set by the Connect Link form). The deployment-level
   * `fallbackInstanceUrl` is only used for connections created without it.
   */
  constructor(credentials: Credentials, fallbackInstanceUrl?: string) {
    const stored = credentials.extra?.['instanceUrl']
    const instanceUrl = typeof stored === 'string' && stored ? stored : fallbackInstanceUrl
    if (!instanceUrl) {
      throw new Error(
        'Manager.io connection is missing its server URL; reconnect it and enter the API endpoint.',
      )
    }
    this.http = axios.create({
      baseURL: getManagerioApiBase(instanceUrl),
      headers: {
        'X-API-Key': credentials.accessToken,
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
