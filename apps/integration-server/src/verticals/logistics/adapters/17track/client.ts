import axios, { type AxiosInstance } from 'axios'
import { TRACK17_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * 17TRACK HTTP client.
 *
 * Authentication: API key passed in the `17token` request header.
 * All endpoints use POST with JSON bodies.
 */
export class Track17Client {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: TRACK17_API_BASE,
      headers: {
        '17token': credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}
