import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

/**
 * Thin HTTP client for the Coda REST API.
 *
 * The API token rides in the `Authorization: Bearer <token>` header. List
 * endpoints return `{ items, nextPageToken, nextPageLink }` and page via an
 * opaque `pageToken` cursor (passed back as `?pageToken=`).
 */
export class CodaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }
}
