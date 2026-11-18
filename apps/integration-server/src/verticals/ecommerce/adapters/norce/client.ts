/**
 * Norce Commerce Query (OData v4) client.
 *
 * Every data call needs `Authorization: Bearer` AND a numeric `ApplicationId`
 * header (see `./connect-form.ts` / `./auth.ts`). Reads go through Commerce
 * Query, e.g. `GET /commerce/query/2.0/Products/Products`, which supports
 * standard OData v4 `$top` / `$skip` / `$count`.
 *
 * Docs: https://docs.norce.io/api-reference/query/queryproducts/openapi
 *       https://docs.norce.io/api-reference/query/querycustomers/openapi
 *       https://docs.norce.io/api-reference/query/queryorders/openapi
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { queryBaseUrl } from './auth'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ODataListResult<T> {
  items: T[]
  totalCount?: number
}

/** OData single-entity key syntax: unquoted for numeric keys, quoted otherwise. */
export function odataKey(id: string): string {
  return /^-?\d+$/.test(id) ? id : `'${id.replace(/'/g, "''")}'`
}

export class NorceClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const host = credentials.extra?.['host'] as string | undefined
    const applicationId = credentials.extra?.['applicationId'] as string | number | undefined
    if (!host) {
      throw new Error(
        'NorceClient: credentials.extra.host is required — re-create the connection via the Connect Link form.',
      )
    }
    if (!credentials.accessToken) {
      throw new Error('NorceClient: credentials.accessToken is required')
    }
    if (applicationId == null || applicationId === '') {
      throw new Error('NorceClient: credentials.extra.applicationId is required')
    }

    this.http = axios.create({
      baseURL: queryBaseUrl(host),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        ApplicationId: String(applicationId),
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** List an OData entity set with `$top`/`$skip`, optionally requesting an inline `$count`. */
  async list<T>(
    entitySet: string,
    opts: { top?: number; skip?: number; filter?: string; count?: boolean } = {},
  ): Promise<ODataListResult<T>> {
    const top = Math.min(opts.top ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const params: Record<string, unknown> = { $top: top, $skip: opts.skip ?? 0 }
    if (opts.filter) params['$filter'] = opts.filter
    if (opts.count) params['$count'] = true

    return withRetry(async () => {
      const { data } = await this.http.get<{ value: T[]; '@odata.count'?: number }>(entitySet, {
        params,
      })
      return { items: data.value ?? [], totalCount: data['@odata.count'] }
    })
  }

  /** Fetch a single entity by its OData key, e.g. `Products/Products(123)`. */
  async getById<T>(entitySet: string, id: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(`${entitySet}(${odataKey(id)})`)
      return data
    })
  }
}
