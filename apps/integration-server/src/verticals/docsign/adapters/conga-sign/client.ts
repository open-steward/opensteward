/**
 * Conga Sign signconnector REST API client.
 *
 * Bearer-token auth + JSON. The RLS host is resolved per-region from
 * `credentials.extra.region` (set at token mint time); an unknown stored
 * region is refused rather than silently sent to production US. All resource
 * paths nest under `${apiBaseUrl}/api/signconnector/v1`. The public
 * signconnector surface is fetch-by-id (one transaction/package at a time)
 * rather than list-paginated, so the client exposes simple get/put verbs.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { connectionCongaSignRegion } from './auth'
import { REGION_HOSTS, SIGNCONNECTOR_PREFIX } from './constants'

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

export class CongaSignClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiBaseUrl = REGION_HOSTS[connectionCongaSignRegion(credentials)].apiBaseUrl
    this.http = axios.create({
      baseURL: `${apiBaseUrl}${SIGNCONNECTOR_PREFIX}`,
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

  async put<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
