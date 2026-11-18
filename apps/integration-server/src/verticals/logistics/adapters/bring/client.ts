import axios, { type AxiosInstance } from 'axios'
import { BRING_API_BASE } from './constants'
import { parseCredentials } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class BringClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, clientUrl = 'https://github.com/open-logistics-integration') {
    const { uid, apiKey } = parseCredentials(credentials.accessToken)
    this.http = axios.create({
      baseURL: BRING_API_BASE,
      headers: {
        'X-MyBring-API-Uid': uid,
        'X-MyBring-API-Key': apiKey,
        'X-Bring-Client-URL': clientUrl,
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
