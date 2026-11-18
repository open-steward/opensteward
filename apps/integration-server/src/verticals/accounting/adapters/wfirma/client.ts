/**
 * wFirma API v2 HTTP client.
 *
 * All requests:
 *   - send JSON (inputFormat=json) and expect JSON (outputFormat=json)
 *   - authenticate via three headers: accessKey / secretKey / appKey
 *   - wrap find-request bodies as: { [resource]: [{ parameters: { page, limit, ... } }] }
 *   - wrap create/edit bodies as:  { [resource]: [{ [singular]: { ...fields } }] }
 *
 * Responses are shaped as:
 *   {
 *     status: { code: 'OK' },
 *     [resource]: [
 *       { [singular]: { ...fields } },
 *       ...
 *     ]
 *   }
 *
 * Docs: https://doc.wfirma.pl/
 */

import axios, { type AxiosInstance } from 'axios'
import { WFIRMA_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { buildAuthHeaders } from './auth'
import { withRetry } from '@opensteward/shared'

/** wFirma top-level response envelope */
export interface WfirmaResponse<T = unknown> {
  status: { code: string }
  [key: string]: T | { code: string } | unknown
}

export class WfirmaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const authHeaders = buildAuthHeaders(credentials)
    this.http = axios.create({
      baseURL: WFIRMA_API_BASE,
      params: { outputFormat: 'json', inputFormat: 'json' },
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /**
   * GET a single resource by ID.
   * Path example: `/invoices/get/42`
   */
  async get<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<WfirmaResponse<T>>(path)
      this.assertOk(data, path)
      return data as unknown as T
    })
  }

  /**
   * POST to a find/list endpoint.
   * Sends pagination params inside the wFirma envelope.
   * Returns the raw response data for the caller to unwrap by resource key.
   */
  async find<T>(resource: string, parameters: Record<string, unknown>): Promise<T> {
    const body = { [resource]: [{ parameters }] }
    return withRetry(async () => {
      const { data } = await this.http.post<WfirmaResponse<T>>(`/${resource}/find`, body)
      this.assertOk(data, `/${resource}/find`)
      return data as unknown as T
    })
  }

  /**
   * POST to an add endpoint.
   * body shape: { [resource]: [{ [singular]: { ...fields } }] }
   */
  async add<T>(resource: string, singular: string, fields: Record<string, unknown>): Promise<T> {
    const body = { [resource]: [{ [singular]: fields }] }
    return withRetry(async () => {
      const { data } = await this.http.post<WfirmaResponse<T>>(`/${resource}/add`, body)
      this.assertOk(data, `/${resource}/add`)
      return data as unknown as T
    })
  }

  /**
   * POST to an edit endpoint.
   * body shape: { [resource]: [{ [singular]: { ...fields } }] }
   */
  async edit<T>(resource: string, singular: string, id: string | number, fields: Record<string, unknown>): Promise<T> {
    const body = { [resource]: [{ [singular]: fields }] }
    return withRetry(async () => {
      const { data } = await this.http.post<WfirmaResponse<T>>(`/${resource}/edit/${id}`, body)
      this.assertOk(data, `/${resource}/edit/${id}`)
      return data as unknown as T
    })
  }

  private assertOk(data: WfirmaResponse, path: string): void {
    const code = (data?.status as { code?: string })?.code
    if (code !== 'OK') {
      throw new Error(`wFirma API error on ${path}: status.code=${code ?? 'unknown'}`)
    }
  }
}

// ── Response helpers ──────────────────────────────────────────────────────────

/**
 * Extract a list of singular objects from a wFirma find response.
 *
 * Example: extractList(data, 'invoices', 'invoice') returns all invoice objects.
 */
export function extractList<T>(
  data: Record<string, unknown>,
  resource: string,
  singular: string,
): T[] {
  const items = data[resource]
  if (!Array.isArray(items)) return []
  const results: T[] = []
  for (const item of items) {
    if (item && typeof item === 'object' && singular in (item as Record<string, unknown>)) {
      results.push((item as Record<string, unknown>)[singular] as T)
    }
  }
  return results
}

/**
 * Extract a single singular object from a wFirma get/add/edit response.
 */
export function extractOne<T>(
  data: Record<string, unknown>,
  resource: string,
  singular: string,
): T {
  const items = data[resource]
  if (Array.isArray(items) && items.length > 0) {
    const first = items[0] as Record<string, unknown>
    if (first && singular in first) return first[singular] as T
  }
  throw new Error(`wFirma: could not extract ${singular} from response`)
}
