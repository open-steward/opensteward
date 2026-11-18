import axios, { type AxiosInstance } from 'axios'
import { SILA_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class SilaClient {
  private http: AxiosInstance
  private readonly appHandle: string

  constructor(credentials: Credentials) {
    this.appHandle = credentials.extra?.appHandle as string ?? ''
    this.http = axios.create({
      baseURL: SILA_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        authsignature: credentials.accessToken,
      },
    })
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, {
        ...body,
        header: { app_handle: this.appHandle },
      })
      return data
    })
  }
}
