/**
 * SAP S/4HANA Cloud OData v2 client.
 *
 * Per-tenant base URL is assembled from credentials.extra.tenantUrl:
 *   https://<tenantUrl>/sap/opu/odata/sap/<SERVICE_NAME>
 *
 * Pagination: OData v2 returns { d: { results: T[], __next?: string } }.
 * paginate() follows d.__next until it holds maxRecords rows or the link ends.
 *
 * Rate-limits / 5xx: exponential back-off up to 4 retries.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { ODATA_PATH_PREFIX, DEFAULT_PAGE_SIZE, NEXT_LINK_KEY } from './constants'

/** Standard OData v2 response envelope */
interface ODataV2Response<T> {
  d: {
    results?: T[]
    /** single-entity responses omit results and put fields directly on d */
    [key: string]: unknown
    __next?: string
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const e = err as AxiosError
      const status = e.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1_000))
        continue
      }
      throw err
    }
  }
  /* istanbul ignore next */
  throw new Error('unreachable')
}

export class SapInventoryClient {
  private tenantUrl: string

  constructor(private readonly credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    const raw = extra['tenantUrl'] ?? ''
    this.tenantUrl = raw.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }

  private instance(service: string): AxiosInstance {
    return axios.create({
      baseURL: `https://${this.tenantUrl}${ODATA_PATH_PREFIX}/${service}`,
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        Accept: 'application/json',
        /** Required by SAP OData v2 for JSON responses */
        'sap-client': (this.credentials.extra as Record<string, string>)['sapClient'] ?? '',
      },
      timeout: 30_000,
    })
  }

  /**
   * Single OData GET — returns the parsed d.results array (or d itself for
   * single-entity lookups).
   *
   * A body that is not a JSON object throws. A host that is not the tenant's
   * API host (<tenant>-api) can answer 200 with an HTML logon page, which
   * would otherwise read as no rows at all.
   */
  async get<T>(
    service: string,
    entitySet: string,
    params?: Record<string, unknown>,
  ): Promise<ODataV2Response<T>['d']> {
    return withRetry(async () => {
      const http = this.instance(service)
      const { data } = await http.get<ODataV2Response<T>>(`/${entitySet}`, {
        params: { $format: 'json', ...params },
      })
      const body: unknown = data
      if (typeof body !== 'object' || body === null || Array.isArray(body))
        throw new Error(
          `sap-inventory: ${service}/${entitySet} answered with a body that is not OData JSON; ` +
            'check that tenantUrl names the API host (<tenant>-api.s4hana.ondemand.com)',
        )
      return data.d
    })
  }

  /**
   * Paginate through ALL pages of an entity set, collecting results.
   * Uses OData v2 __next link for continuation.
   */
  async paginate<T>(
    service: string,
    entitySet: string,
    params?: Record<string, unknown>,
    maxRecords = 10_000,
  ): Promise<T[]> {
    const results: T[] = []
    let nextPath: string | undefined = `/${entitySet}`
    let query: Record<string, unknown> | undefined = {
      $format: 'json',
      $top: DEFAULT_PAGE_SIZE,
      ...params,
    }

    const http = this.instance(service)

    while (nextPath && results.length < maxRecords) {
      const page = await withRetry(async () => {
        const { data } = await http.get<ODataV2Response<T>>(nextPath!, {
          params: query,
        })
        return data.d
      })

      const batch = (page.results ?? []) as T[]
      results.push(...batch)

      // __next is a full URL — extract just the path+query portion
      const rawNext = page[NEXT_LINK_KEY] as string | undefined
      if (rawNext) {
        try {
          const u = new URL(rawNext)
          nextPath = u.pathname + u.search
          query = undefined // __next URL already contains all query params
        } catch {
          nextPath = undefined
        }
      } else {
        nextPath = undefined
      }
    }

    return results
  }
}
