/**
 * MRI Software REST API HTTP client.
 *
 * Builds the per-tenant base URL from `credentials.extra.instanceUrl` and
 * attaches the Bearer access token.  OData-style pagination ($top / $skip)
 * is expressed via query parameters at the call site.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { MRI_API_PATH } from './constants'
import type { Credentials } from '../../adapter/interface'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      if (axiosErr.response?.status === 429 && i < retries) {
        const retryAfter = axiosErr.response.headers?.['retry-after']
        const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, i + 1) * 1000
        await new Promise((r) => setTimeout(r, delayMs))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class MriSoftwareClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const instanceUrl = (credentials.extra?.['instanceUrl'] as string) ?? ''
    this.http = axios.create({
      baseURL: `${instanceUrl}${MRI_API_PATH}`,
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
