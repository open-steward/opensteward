import axios, { type AxiosInstance } from 'axios'
import { XLEDGER_GRAPHQL_URL } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

// Xledger exposes a GraphQL API only — no REST endpoints.
// Authorization header format: "token <api-token>"

export interface GraphQLResponse<T> {
  data: T
  errors?: Array<{ message: string }>
}

export class XledgerClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: XLEDGER_GRAPHQL_URL,
      headers: {
        // Xledger requires "token <hash>" — not "Bearer <hash>"
        Authorization: `token ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<GraphQLResponse<T>>('', { query, variables })
      if (data.errors?.length) {
        throw new Error(data.errors.map((e) => e.message).join('; '))
      }
      return data.data
    })
  }

  async mutate<T>(mutation: string, variables?: Record<string, unknown>): Promise<T> {
    return this.query<T>(mutation, variables)
  }
}
