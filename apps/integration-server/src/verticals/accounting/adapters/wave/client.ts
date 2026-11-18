import axios, { type AxiosInstance } from 'axios'
import { WAVE_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class WaveClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: WAVE_API_BASE,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async query<T>(queryStr: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<{ data: T; errors?: unknown[] }>('', {
        query: queryStr,
        variables,
      })
      if (data.errors?.length) throw new Error(JSON.stringify(data.errors))
      return data.data
    })
  }
}
