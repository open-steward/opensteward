import axios, { type AxiosInstance } from 'axios'
import { DA_VINCI_API_DEFAULT_SERVER } from './constants'
import { authHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Builds the API base URL for a given set of credentials.
 *
 * Da Vinci URL structure:
 *   {serverUrl}/{licenseId}/{dbName}/{sessionId?}/
 *
 * When sessionId is absent (pre-session calls like auth), the path stops at
 * dbName.  For resource calls the caller must append the session segment or
 * embed it in the resource path.
 */
function buildBaseUrl(credentials: Credentials): string {
  const serverUrl = String(credentials.extra?.['serverUrl'] ?? DA_VINCI_API_DEFAULT_SERVER).replace(/\/$/, '')
  const licenseId = String(credentials.extra?.['licenseId'] ?? '')
  const dbName = String(credentials.extra?.['dbName'] ?? '')
  const sessionId = credentials.extra?.['sessionId']
    ? String(credentials.extra['sessionId'])
    : undefined

  const parts = [serverUrl, licenseId, dbName]
  if (sessionId) parts.push(sessionId)
  return parts.filter(Boolean).join('/') + '/'
}

export class DaVinciUnifiedClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: buildBaseUrl(credentials),
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
