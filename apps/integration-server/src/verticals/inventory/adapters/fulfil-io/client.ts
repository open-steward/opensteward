import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE } from './constants'

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

/**
 * Fulfil.io REST API v2 client.
 *
 * Base URL: https://{subdomain}.fulfil.io/api/v2
 * Auth: x-api-key header
 * Pagination: page + per_page query params
 * Model endpoints: /model/{model.name}
 */
export class FulfilClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const subdomain = String(credentials.extra?.['subdomain'] ?? '')
    if (!subdomain) throw new Error('fulfil-io requires credentials.extra.subdomain')
    const baseURL = `https://${subdomain}.fulfil.io/api/v2`
    this.http = axios.create({
      baseURL,
      headers: {
        'x-api-key': credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * List records from a model with pagination.
   * GET /model/{modelName}?page=1&per_page=100&fields[]=field1&...
   */
  async list<T>(
    modelName: string,
    fields: string[],
    page = 1,
    perPage: number = DEFAULT_PAGE_SIZE,
  ): Promise<T[]> {
    return withRetry(async () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('per_page', String(perPage))
      for (const f of fields) params.append('fields[]', f)
      const { data } = await this.http.get<T[]>(`/model/${modelName}`, { params })
      return Array.isArray(data) ? data : []
    })
  }

  /**
   * Get a single record by ID.
   * GET /model/{modelName}/{id}?fields[]=field1&...
   */
  async getById<T>(modelName: string, id: number | string, fields: string[]): Promise<T> {
    return withRetry(async () => {
      const params = new URLSearchParams()
      for (const f of fields) params.append('fields[]', f)
      const { data } = await this.http.get<T>(`/model/${modelName}/${id}`, { params })
      return data
    })
  }

  /**
   * Search records using Fulfil domain filters.
   * PUT /model/{modelName}/search_read with body: { domain, fields, offset, limit }
   */
  async searchRead<T>(
    modelName: string,
    domain: unknown[],
    fields: string[],
    offset = 0,
    limit: number = DEFAULT_PAGE_SIZE,
  ): Promise<T[]> {
    return withRetry(async () => {
      const { data } = await this.http.put<T[]>(`/model/${modelName}/search_read`, {
        domain,
        fields,
        offset,
        limit,
      })
      return Array.isArray(data) ? data : []
    })
  }
}
