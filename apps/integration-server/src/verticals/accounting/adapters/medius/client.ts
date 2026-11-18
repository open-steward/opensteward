/**
 * Medius AP Automation – HTTP client.
 *
 * Base URL: https://cloud.mediusflow.com/{tenant}/api/api
 * Auth:     Bearer <access_token>  (OAuth2)
 * Pagination: offset / limit (max 1 000 per page) on export endpoints.
 *
 * Docs: https://success.medius.com/documentation/integration-documentation/
 */

import axios, { type AxiosInstance } from 'axios'
import { mediusApiBase } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class MediusClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const tenant = credentials.tenantId ?? ''
    this.http = axios.create({
      baseURL: `${mediusApiBase(tenant)}/`,
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
}
