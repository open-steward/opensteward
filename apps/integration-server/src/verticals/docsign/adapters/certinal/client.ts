/**
 * Certinal eSign REST API client.
 *
 * Bearer auth + JSON. The access token minted by the client_credentials grant
 * (see ./auth) ships as `Authorization: Bearer <token>` — every operation in
 * the reference lists "Security: Bearer Auth", e.g.
 * https://certinal.stoplight.io/docs/api/e750bb3f1df32-get-transaction-details-by-transaction-id
 *
 * The host is per-tenant: `credentials.extra.apiBaseUrl` (the token
 * response's `api_access_point`, else the API URL the customer entered) and
 * all resource paths nest under `${host}${API_PREFIX}`. The host is checked
 * against private address space before the first request, and redirects are
 * not followed, so a tenant-supplied host cannot steer the bearer token into
 * an internal network.
 *
 * Responses are wrapped as `{ timestamp, statusCode, message, data }`.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { assertPublicHost, type Credentials } from '@opensteward/shared'
import { API_PREFIX } from './constants'
import { normaliseApiUrl } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Standard Certinal envelope around every response payload. */
export interface CertinalResponse<T> {
  timestamp?: number
  statusCode?: number
  message?: string
  data?: T
}

/** The API host for a connection: the token's api_access_point, else the entered API URL. */
export function resolveApiHost(credentials: Credentials): string {
  const extra = credentials.extra ?? {}
  const candidate =
    (typeof extra['apiBaseUrl'] === 'string' && extra['apiBaseUrl']) ||
    (typeof extra['apiUrl'] === 'string' && extra['apiUrl']) ||
    ''
  if (!candidate) {
    throw new Error(
      'Certinal connection has no API URL; reconnect it with the Custom Integration Client ID, Secret and API URL.',
    )
  }
  return normaliseApiUrl(candidate)
}

export class CertinalClient {
  private http: AxiosInstance
  private readonly host: string
  private hostChecked: Promise<void> | undefined

  constructor(credentials: Credentials) {
    const baseUrl = resolveApiHost(credentials)
    this.host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '')
    this.http = axios.create({
      baseURL: `${baseUrl}${API_PREFIX}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      maxRedirects: 0,
      timeout: 30_000,
    })
  }

  private ensurePublicHost(): Promise<void> {
    this.hostChecked ??= assertPublicHost(this.host)
    return this.hostChecked
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    await this.ensurePublicHost()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    await this.ensurePublicHost()
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
