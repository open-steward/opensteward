/**
 * LogiCommerce API Sync client.
 *
 * Host: the getting-started guide
 * (https://api-sync.logicommerce.cloud/docs/guide.cfm?languageId=2) lists
 * "Production environment : https://api-sync.logicommerce.cloud" and
 * "Studio environment : https://api-sync-studio.logicommerce.cloud". Every
 * reference example request sits under `/v1`, e.g.
 * "http://api-sync.logicommerce.cloud/v1/products". The adapter has no
 * environment key, so it uses the production host.
 *
 * Auth: the `appId` and `Authorization: Basic <token>` headers built in
 * ./auth.ts.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { apiSyncHeaders } from './auth'

export const API_SYNC_BASE_URL = 'https://api-sync.logicommerce.cloud/v1'

export class LogicommerceSyncClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_SYNC_BASE_URL,
      headers: {
        ...apiSyncHeaders(credentials),
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
}
