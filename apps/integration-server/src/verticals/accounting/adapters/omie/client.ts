import axios, { type AxiosInstance } from 'axios'
import { OMIE_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class OmieClient {
  private http: AxiosInstance
  private appKey: string
  private appSecret: string

  constructor(credentials: Credentials) {
    // credentials.accessToken format: "app_key:app_secret"
    const [appKey, appSecret] = credentials.accessToken.split(':')
    this.appKey = appKey
    this.appSecret = appSecret
    this.http = axios.create({
      baseURL: OMIE_API_BASE,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async call<T>(
    endpoint: string,
    method: string,
    params: Record<string, unknown>[],
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(endpoint, {
        call: method,
        app_key: this.appKey,
        app_secret: this.appSecret,
        param: params,
      })
      return data
    })
  }
}
