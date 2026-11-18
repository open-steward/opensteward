/**
 * LedgerSMB API client.
 *
 * Auth: the `accessToken` is a LedgerSMB session cookie value.
 * It is sent as `Cookie: LedgerSMB=<token>` with every request.
 *
 * The instance URL is stored in `credentials.extra.instanceUrl` and
 * `credentials.extra.company`; the API base is:
 *   {instanceUrl}/erp/api/v0/
 *
 * Concurrency: PUT/PATCH require an `If-Match` header with the ETag from the
 * prior GET. Where we perform updates we accept the etag as a parameter.
 *
 * Docs: https://book.ledgersmb.org/dev/full-book/
 */

import axios, { type AxiosInstance } from 'axios'
import { LEDGERSMB_API_PATH } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class LedgerSMBClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = credentials.extra as Record<string, string> | undefined
    const instanceUrl = (extra?.instanceUrl ?? '').replace(/\/+$/, '')
    const company = extra?.company ?? ''

    // API base: {instanceUrl}/erp/api/v0/ — company is a path component in
    // some endpoints but is already encoded in the session cookie context.
    const baseURL = `${instanceUrl}/${LEDGERSMB_API_PATH}/`

    this.http = axios.create({
      baseURL,
      headers: {
        // Session cookie authentication
        Cookie: `LedgerSMB=${credentials.accessToken}; company=${encodeURIComponent(company)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async getWithEtag<T>(path: string): Promise<{ data: T; etag: string | undefined }> {
    return withRetry(async () => {
      const response = await this.http.get<T>(path)
      return {
        data: response.data,
        etag: response.headers['etag'] as string | undefined,
      }
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body: unknown, etag?: string): Promise<T> {
    return withRetry(async () => {
      const headers: Record<string, string> = {}
      if (etag) headers['If-Match'] = etag
      const { data } = await this.http.put<T>(path, body, { headers })
      return data
    })
  }

  async delete(path: string, etag?: string): Promise<void> {
    return withRetry(async () => {
      const headers: Record<string, string> = {}
      if (etag) headers['If-Match'] = etag
      await this.http.delete(path, { headers })
    })
  }
}
