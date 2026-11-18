import axios, { type AxiosInstance } from 'axios'
import { ICOUNT_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class ICountClient {
  private http: AxiosInstance
  private apiKey: string
  private cid?: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.cid = credentials.extra?.['cid'] as string | undefined
    this.http = axios.create({
      baseURL: ICOUNT_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  private authParams(): Record<string, unknown> {
    return {
      api_key: this.apiKey,
      ...(this.cid && { cid: this.cid }),
    }
  }

  async post<T>(action: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>('', {
        ...this.authParams(),
        action,
        ...body,
      })
      return data
    })
  }

  async get<T>(action: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>('', {
        params: {
          ...this.authParams(),
          action,
          ...params,
        },
      })
      return data
    })
  }
}
