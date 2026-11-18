/**
 * Dext Precision HTTP client.
 *
 * Authenticates using a static Bearer token.  All calls go to the
 * api.precision.dext.com REST API.
 *
 * Rate limit: 60 req/min; 429 responses include X-RateLimit-Remaining.
 */

import axios, { type AxiosInstance } from 'axios'
import { DEXT_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class DextClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${DEXT_API_BASE}/`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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
}
