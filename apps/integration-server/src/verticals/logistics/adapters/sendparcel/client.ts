import axios, { type AxiosInstance } from 'axios'
import { SENDPARCEL_API_BASE } from './constants'
import { authHeaders } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Every `/rest-api/` operation SendParcel documents, apart from
 * `GET /rest-api/services`, is a POST with a JSON body, so this client only posts.
 */
export class SendParcelClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: SENDPARCEL_API_BASE,
      headers: {
        ...authHeaders(credentials.accessToken),
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
