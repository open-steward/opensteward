/**
 * LibreSign REST API client.
 *
 * LibreSign runs as a Nextcloud app reached through the OCS gateway:
 *   ${serverUrl}/ocs/v2.php/apps/libresign/api/v1/...
 *
 * Auth is HTTP Basic of `username:appPassword`; OCS additionally requires the
 * `OCS-APIRequest: true` header and `Accept: application/json` to get a JSON
 * (rather than XML) envelope back. The server URL + username come from
 * `credentials.extra`; the app password is `credentials.accessToken`.
 *
 * Every OCS reply is wrapped as `{ ocs: { meta, data } }`; the client unwraps
 * `ocs.data` for callers.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, OCS_PREFIX } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** OCS envelope: `{ ocs: { meta: {...}, data: T } }`. */
interface OcsEnvelope<T> {
  ocs?: {
    meta?: { status?: string; statuscode?: number; message?: string }
    data?: T
  }
}

export class LibreSignClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // Both come from the connect form (auth.ts requires them). LibreSign is
    // self-hosted, so there is no vendor host to fall back to: a missing one
    // must fail here rather than send Basic credentials somewhere invented.
    const rawUrl = credentials.extra?.['serverUrl']
    const rawUser = credentials.extra?.['username']
    if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
      throw new Error(
        'LibreSign connection has no serverUrl; reconnect with the Nextcloud server URL.',
      )
    }
    if (typeof rawUser !== 'string' || rawUser.trim() === '') {
      throw new Error(
        'LibreSign connection has no username; reconnect with the Nextcloud username.',
      )
    }
    const serverUrl = rawUrl.replace(/\/+$/, '')
    const username = rawUser
    const basic = Buffer.from(`${username}:${credentials.accessToken ?? ''}`).toString('base64')
    this.http = axios.create({
      baseURL: `${serverUrl}${OCS_PREFIX}/${API_VERSION}`,
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
        'OCS-APIRequest': 'true',
      },
      timeout: 30_000,
    })
  }

  private unwrap<T>(env: OcsEnvelope<T>): T {
    return (env?.ocs?.data ?? ({} as T)) as T
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<OcsEnvelope<T>>(path, { params })
      return this.unwrap(data)
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<OcsEnvelope<T>>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return this.unwrap(data)
    })
  }
}
