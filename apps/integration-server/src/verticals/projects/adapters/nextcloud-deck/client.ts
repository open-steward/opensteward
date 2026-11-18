/**
 * Nextcloud Deck HTTP client.
 *
 * Auth: HTTP Basic Auth encoded as a Base64 `username:app_password` string
 * stored in credentials.accessToken. The `serverUrl` comes from
 * credentials.extra.serverUrl and is prepended to every path.
 *
 * Required headers on every request:
 *   Authorization: Basic <base64>
 *   OCS-APIRequest: true
 *   Content-Type: application/json
 *
 * The Deck boards/stacks/cards API lives at:
 *   <serverUrl>/index.php/apps/deck/api/v1.0
 *
 * The OCS comments API lives at:
 *   <serverUrl>/ocs/v2.php/apps/deck/api/v1.0
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PATH, OCS_API_PATH } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class NextcloudDeckClient {
  private http: AxiosInstance
  private ocsHttp: AxiosInstance

  constructor(credentials: Credentials) {
    const serverUrl = String(credentials.extra?.['serverUrl'] ?? '').replace(/\/$/, '')
    const authHeader = `Basic ${credentials.accessToken}`

    const commonHeaders = {
      Authorization: authHeader,
      'OCS-APIRequest': 'true',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    this.http = axios.create({
      baseURL: `${serverUrl}${API_PATH}`,
      headers: commonHeaders,
      timeout: 30_000,
    })

    this.ocsHttp = axios.create({
      baseURL: `${serverUrl}${OCS_API_PATH}`,
      headers: commonHeaders,
      timeout: 30_000,
    })
  }

  /** GET against the Deck REST API (boards / stacks / cards / labels) */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  /** GET against the OCS API (comments) */
  async ocsGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.ocsHttp.get<T>(path, {
        params: { format: 'json', ...params },
      })
      return data
    })
  }
}
