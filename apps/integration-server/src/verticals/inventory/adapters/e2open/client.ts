/**
 * E2open CDM API HTTP client.
 *
 * All requests are authenticated via OAuth 2.0 Bearer token.
 * The CDM API uses POST for both reads (search) and writes (submit).
 * The `tid` query parameter (tenant identifier) is required on every call.
 *
 * Rate limits: max 25 concurrent API calls; 429 triggers exponential back-off.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, CDM_PATH, DEFAULT_PAGE_SIZE } from './constants'

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

export interface CdmSearchBody {
  offset?: number
  limit?: number
  sortFields?: string
  filters?: Record<string, unknown>
}

export interface CdmListResponse<T> {
  data?: T[]
  total?: number
  offset?: number
  limit?: number
}

export class E2openClient {
  private http: AxiosInstance
  private tenantId: string

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    this.tenantId = (extra['tenantId'] as string | undefined) ?? ''

    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept:        'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * POST /cdm/v1/transactions — read/search CDM transactions.
   *
   * @param entity  CDM entity type: 'Inventory', 'POS', 'Shipment', etc.
   * @param body    Search filters, offset, limit.
   */
  async searchTransactions<T>(
    entity: string,
    body: CdmSearchBody = {},
  ): Promise<CdmListResponse<T>> {
    return withRetry(async () => {
      const params: Record<string, string> = {
        tid:    this.tenantId,
        entity,
      }
      const { data } = await this.http.post<CdmListResponse<T>>(
        `${CDM_PATH}/transactions`,
        {
          offset:  body.offset ?? 0,
          limit:   body.limit  ?? DEFAULT_PAGE_SIZE,
          ...(body.sortFields ? { sortFields: body.sortFields } : {}),
          ...(body.filters    ? { filters:    body.filters }    : {}),
        },
        { params },
      )
      return data
    })
  }

  /**
   * GET a single CDM resource by its URL path.
   * Used for individual-record lookups where a GET endpoint exists.
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { tid: this.tenantId, ...params },
      })
      return data
    })
  }
}
