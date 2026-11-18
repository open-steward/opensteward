/**
 * Moov REST client: a thin axios wrapper.
 *
 * Every request carries `Authorization: Basic <base64(public:private)>`
 * (https://docs.moov.io/api/authentication/api-authentication/) and the pinned
 * `X-Moov-Version` header (see constants.ts).
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_VERSION } from './constants'

export class MoovClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
        'X-Moov-Version': API_VERSION,
        Accept: 'application/json',
      },
      timeout: 60_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const { data } = await this.http.get<T>(path, params ? { params } : undefined)
    return data
  }
}
