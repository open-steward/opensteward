/**
 * SAP EWM HTTP client.
 *
 * SAP OData v2 services require:
 *   - Accept: application/json
 *   - $format=json query param (belt-and-suspenders; some GW versions ignore Accept)
 *   - Authorization: Bearer <token>
 *
 * Pagination is via $skip / $top.  Responses wrap entities in
 *   { "d": { "results": [...], "__count": "N" } }
 * for collections and { "d": { ... } } for single entities.
 *
 * The baseUrl is stored in credentials.extra.baseUrl (set during exchangeCredentials)
 * and re-normalised here; every request first checks that the host still
 * resolves to a public address, because it carries the bearer token.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { assertPublicHost } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { normaliseSapBaseUrl, normaliseSapClient, sapHostOf } from './auth'

/** Standard SAP OData v2 collection envelope. */
export interface ODataCollection<T> {
  d: {
    results: T[]
    __count?: string
  }
}

/** Standard SAP OData v2 single-entity envelope. */
export interface ODataEntity<T> {
  d: T
}

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
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1_000))
        continue
      }
      throw err
    }
  }
  /* istanbul ignore next */
  throw new Error('unreachable')
}

export class SapEwmClient {
  private http: AxiosInstance
  private readonly host: string

  constructor(credentials: Credentials) {
    const extra = credentials.extra ?? {}
    const baseUrl = normaliseSapBaseUrl(extra['baseUrl'])
    const sapClient = normaliseSapClient(extra['sapClient'])
    this.host = sapHostOf(baseUrl)

    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      params: { $format: 'json', ...(sapClient ? { 'sap-client': sapClient } : {}) },
      timeout: 30_000,
    })
  }

  /**
   * GET a collection from an OData v2 service path.
   * Merges caller-supplied params with any default params on the instance.
   */
  async getCollection<T>(
    servicePath: string,
    entitySet: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    await assertPublicHost(this.host)
    return withRetry(async () => {
      const path = `${servicePath}/${entitySet}`
      const { data } = await this.http.get<ODataCollection<T>>(path, { params })
      return data?.d?.results ?? []
    })
  }

  /**
   * GET a single entity by its OData key predicate, e.g. "(WarehouseNumber='0001',Product='MAT1')".
   */
  async getEntity<T>(
    servicePath: string,
    entitySet: string,
    keyPredicate: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    await assertPublicHost(this.host)
    return withRetry(async () => {
      const path = `${servicePath}/${entitySet}${keyPredicate}`
      const { data } = await this.http.get<ODataEntity<T>>(path, { params })
      return data.d
    })
  }
}
