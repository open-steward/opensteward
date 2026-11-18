/**
 * DocuSign eSignature REST API client.
 *
 * DocuSign uses Bearer-token auth + JSON. The envelope and template lists page
 * by `count` and a zero-based `start_position`, and answer with a string
 * `totalSetSize` and a `nextUri` that is null on the last set. The recipient,
 * document and audit-event lists of one envelope take no paging parameter and
 * return the whole list. See `DocuSignAdapter` in ./index.ts.
 *
 * Per-account `base_uri` comes from /oauth/userinfo and is stored on
 * `credentials.extra.baseUri`. All resource paths nest under
 * `${baseUri}/restapi/v2.1/accounts/${accountId}/...`.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, DEFAULT_BASE_URI } from './constants'

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

export class DocuSignClient {
  private http: AxiosInstance
  private accountId: string

  constructor(credentials: Credentials) {
    const baseUri = String(credentials.extra?.['baseUri'] ?? DEFAULT_BASE_URI)
    this.accountId = String(credentials.extra?.['accountId'] ?? '')
    this.http = axios.create({
      baseURL: `${baseUri}/restapi/${API_VERSION}/accounts/${this.accountId}`,
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

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path)
      return data
    })
  }
}
