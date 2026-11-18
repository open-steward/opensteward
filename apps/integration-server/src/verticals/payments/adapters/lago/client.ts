/**
 * Lago REST API client — thin axios wrapper.
 *
 * Auth is a Bearer token (`Authorization: Bearer <api_key>`). Both requests and
 * responses are JSON (`Content-Type: application/json`). Lists are page-based:
 * `?page=&per_page=`, returning `{ <resource>: [...], meta: { current_page,
 * next_page, prev_page, total_pages, total_count } }`. The base origin (cloud
 * region or self-hosted host) is resolved from the credentials; all paths are
 * served under `/api/v1`.
 *
 * Docs: https://getlago.com/docs/api-reference/api-standards
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_PATH } from './constants'
import { resolveBaseUrl } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500 && s < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Page-based list envelope: `{ <resource>: T[], meta: {...} }`. */
export interface LagoMeta {
  current_page?: number
  next_page?: number | null
  prev_page?: number | null
  total_pages?: number
  total_count?: number
}

export class LagoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${resolveBaseUrl(credentials)}${API_BASE_PATH}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.put<T>(path, body)).data)
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => (await this.http.delete<T>(path)).data)
  }
}
