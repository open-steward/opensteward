/**
 * OpenSign™ REST API client.
 *
 * API-token auth + JSON. The token is sent in the `x-api-token` header; the
 * base URL (region / self-hosted host) is read from `credentials.extra`.
 *
 * Document list endpoints (`/documentlist/:reportId`) are `limit` + `skip`
 * offset-paginated and return a bare array of documents.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_TOKEN_HEADER, PRODUCTION_BASE_URL } from './constants'

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

export class OpensignClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = String(credentials.extra?.['baseUrl'] ?? PRODUCTION_BASE_URL)
    this.http = axios.create({
      baseURL,
      headers: {
        [API_TOKEN_HEADER]: String(credentials.accessToken ?? ''),
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

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
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

  async delete<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { params })
      return data
    })
  }
}
