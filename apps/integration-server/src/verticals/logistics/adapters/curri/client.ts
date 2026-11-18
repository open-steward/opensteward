import axios, { type AxiosInstance } from 'axios'
import { CURRI_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string; [key: string]: unknown }>
}

export class CurriClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: CURRI_API_BASE,
      headers: {
        Authorization: credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data: resp } = await this.http.post<GraphQLResponse<T>>('', {
        query,
        variables,
      })
      if (resp.errors && resp.errors.length > 0) {
        throw new Error(`Curri GraphQL error: ${resp.errors.map((e) => e.message).join(', ')}`)
      }
      return resp.data as T
    })
  }

  async mutate<T>(mutation: string, variables?: Record<string, unknown>): Promise<T> {
    return this.query<T>(mutation, variables)
  }
}
