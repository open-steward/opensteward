/**
 * Billit HTTP client.
 *
 * Auth: every request sends two headers:
 *   apikey:   {api_key}   — Credentials.accessToken
 *   partyID:  {party_id}  — Credentials.tenantId
 *
 * Pagination: OData-style. Use $top and $skip. Responses include `NextpageLink`
 * when additional pages exist; max 120 records per page.
 *
 * Docs: https://docs.billit.be/docs/getting-started
 */

import axios, { type AxiosInstance } from 'axios'
import { BILLIT_API_BASE, BILLIT_APIKEY_HEADER, BILLIT_PARTYID_HEADER } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class BillitClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const partyId = credentials.tenantId ?? ''
    this.http = axios.create({
      baseURL: `${BILLIT_API_BASE}/v1/`,
      headers: {
        [BILLIT_APIKEY_HEADER]: credentials.accessToken,
        [BILLIT_PARTYID_HEADER]: partyId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }
}
