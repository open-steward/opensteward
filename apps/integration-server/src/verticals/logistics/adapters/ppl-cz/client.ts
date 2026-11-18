import axios, { type AxiosInstance } from 'axios'
import { PPL_CZ_API_BASE } from './constants'
import { authHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * HTTP client for the PPL CZ CPL API.
 *
 * Base URL: https://api.dhl.com/ecs/ppl/myapi2
 * Auth:     Bearer token (OAuth2 client_credentials)
 *
 * The CPL API is asynchronous:
 *   - POST /shipment/batch  →  201 Created + Location header containing batchId
 *   - GET  /shipment/batch/{batchId}  →  batch status + shipment results
 *   - GET  /shipment/batch/{batchId}/label  →  binary label content
 *
 * The client exposes postBatch / getBatch helpers in addition to the standard
 * get / post / put / delete methods.
 */
export class PplCzClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: PPL_CZ_API_BASE,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  /**
   * GET one page of an offset-paged list, with the total the CPL API reports
   * in its `X-Paging-Total-Items-Count` response header (undefined when the
   * header is absent or not a number).
   */
  async getPage<T>(
    path: string,
    params: Record<string, unknown>,
  ): Promise<{ data: T; totalCount: number | undefined }> {
    return withRetry(async () => {
      const { data, headers } = await this.http.get<T>(path, { params })
      const raw: unknown = (headers as Record<string, unknown> | undefined)?.[
        'x-paging-total-items-count'
      ]
      const total = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN
      return {
        data,
        totalCount: Number.isInteger(total) && total >= 0 ? total : undefined,
      }
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * POST a batch request and return the Location header (batchId).
   *
   * PPL CZ batch endpoints return 201 Created with a Location header that
   * contains the URL to poll for results, e.g.:
   *   Location: /shipment/batch/{batchId}
   */
  async postBatch(path: string, body: unknown): Promise<string> {
    return withRetry(async () => {
      const res = await this.http.post(path, body, { validateStatus: (s) => s === 201 })
      const location: string = res.headers['location'] ?? ''
      // Extract batchId from Location header path
      const parts = location.split('/')
      return parts[parts.length - 1] ?? ''
    })
  }

  /**
   * GET a binary label PDF/ZPL from the batch label endpoint.
   * Returns the raw buffer.
   */
  async getLabelBinary(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<Buffer> {
    return withRetry(async () => {
      const { data } = await this.http.get<Buffer>(path, {
        params,
        responseType: 'arraybuffer',
      })
      return data
    })
  }
}
