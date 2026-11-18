/**
 * Infor WMS HTTP client.
 *
 * The base URL is built from the credentials stored after the ION API
 * OAuth2 exchange:
 *   {credentials.extra.ionApiUrl}/{credentials.extra.tenantId}/WMS
 *
 * Every request carries a standard Bearer token header. The ION API
 * Gateway forwards the token to the WMS application server.
 *
 * Pagination: Infor WMS list endpoints accept `pageNumber` (1-based)
 * and `pageSize` query parameters. The response envelope includes
 * `totalCount` and `items` (or resource-specific key).
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { assertPublicHost } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { normaliseInforTenantId, normaliseIonApiUrl } from './auth'
import { WMS_API_PATH } from './constants'

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

/** Construct the WMS API base URL from stored credentials (re-validated: it decides where the token goes). */
function buildBaseUrl(credentials: Credentials): { baseUrl: string; hostname: string; tenantId: string } {
  const extra = credentials.extra ?? {}
  const ionApiUrl = normaliseIonApiUrl(extra['ionApiUrl'])
  const tenantId = normaliseInforTenantId(extra['tenantId'])
  return { baseUrl: `${ionApiUrl}/${tenantId}${WMS_API_PATH}`, hostname: new URL(ionApiUrl).hostname, tenantId }
}

export class InforWmsClient {
  private http: AxiosInstance
  private readonly hostname: string
  private hostCheck?: Promise<void>

  constructor(credentials: Credentials) {
    const { baseUrl, hostname, tenantId } = buildBaseUrl(credentials)
    this.hostname = hostname
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'X-Infor-TenantId': tenantId,
      },
      timeout: 30_000,
    })
  }

  /** The gateway is customer-supplied: vet it once before the bearer token goes to it. */
  private ensurePublicHost(): Promise<void> {
    return (this.hostCheck ??= assertPublicHost(this.hostname))
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
