import axios, { type AxiosInstance } from 'axios'
import { ECOUNT_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class EcountClient {
  private http: AxiosInstance
  private companyCode: string

  constructor(credentials: Credentials, companyCode: string) {
    this.companyCode = companyCode
    this.http = axios.create({
      baseURL: ECOUNT_API_BASE,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        CompanyCode: companyCode,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  getCompanyCode(): string {
    return this.companyCode
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
}
