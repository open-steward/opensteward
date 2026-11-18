/**
 * Oracle WMS Cloud — HTTP client
 *
 * Base URL per tenant: https://{wmsDomain}/{envName}/wms/lgfapi/v10
 * Auth: Bearer token (OAuth 2.0)
 *
 * Pagination (lgfapi paged mode):
 *   Request params: page, page_size, page_mode=paged
 *   Response envelope: { count: number; results: T[] }
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { wmsBaseFromExtra } from './auth'
import { ENTITY_PATH } from './constants'

export interface LgfApiListResponse<T> {
  count?: number
  result_count?: number
  results: T[]
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
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

function buildBaseUrl(credentials: Credentials): string {
  // Re-validated here: the stored host decides where the bearer token goes.
  return `${wmsBaseFromExtra(credentials.extra)}${ENTITY_PATH}`
}

export class OracleWmsClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: buildBaseUrl(credentials),
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

  async list<T>(entity: string, params?: Record<string, unknown>): Promise<LgfApiListResponse<T>> {
    return this.get<LgfApiListResponse<T>>(`/${entity}/`, {
      page_mode: 'paged',
      ...params,
    })
  }

  async getById<T>(entity: string, id: string | number): Promise<T> {
    return this.get<T>(`/${entity}/${id}/`)
  }
}
