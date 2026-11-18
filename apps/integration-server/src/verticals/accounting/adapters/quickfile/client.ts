/**
 * QuickFile REST client.
 *
 * QuickFile's JSON API uses POST for all operations. Each request body wraps
 * a Header (auth) and a Body (method-specific payload). The base URL is
 * https://api.quickfile.co.uk/1_2/{resource}/{method}.
 *
 * The auth Header is MD5-signed per-request (see auth.ts).
 */
import axios, { type AxiosInstance } from 'axios'
import { randomUUID } from 'node:crypto'
import { QUICKFILE_API_BASE } from './constants'
import { buildAuthHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class QuickFileClient {
  private http: AxiosInstance
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
    this.http = axios.create({
      baseURL: `${QUICKFILE_API_BASE}/`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /**
   * POST to a QuickFile endpoint.
   * path: e.g. "invoice/search"
   * body: the method-specific Body payload object.
   */
  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const submissionNumber = randomUUID().replace(/-/g, '').slice(0, 20)
      const envelope = {
        payload: {
          Header: buildAuthHeader(this.credentials, submissionNumber),
          Body: body,
        },
      }
      const { data } = await this.http.post<T>(path, envelope)
      return data
    })
  }
}
