import axios, { type AxiosInstance } from 'axios'
import { SHIPHERO_API_BASE } from './constants'
import { authHeader, isTokenExpired, refreshCredentials } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

/**
 * ShipHero uses GraphQL — all operations POST to /graphql with { query, variables }.
 */
export class ShipheroClient {
  private http: AxiosInstance
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
    this.http = axios.create({
      baseURL: SHIPHERO_API_BASE,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  private async ensureAuth(): Promise<void> {
    if (isTokenExpired(this.credentials)) {
      this.credentials = await refreshCredentials(this.credentials)
      this.http.defaults.headers.common['Authorization'] = authHeader(this.credentials.accessToken)
    }
  }

  async query<T>(gqlQuery: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      const { data } = await this.http.post<GraphQLResponse<T>>('graphql', {
        query: gqlQuery,
        variables: variables ?? {},
      })
      if (data.errors && data.errors.length > 0) {
        throw new Error(`ShipHero GraphQL error: ${data.errors.map((e) => e.message).join('; ')}`)
      }
      if (!data.data) {
        throw new Error('ShipHero GraphQL response missing data')
      }
      return data.data
    })
  }
}
