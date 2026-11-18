/**
 * Access Financials GraphQL client.
 *
 * All requests go to a single POST endpoint:
 *   POST https://api.erp.accessacloud.com/financials-graphql
 *
 * Required headers per request:
 *   Authorization: Bearer <access_token>
 *   Ocp-Apim-Subscription-Key: <subscription_key>
 *   Content-Type: application/json
 *
 * The access token is stored in `credentials.accessToken`.
 * The subscription key is stored in `credentials.extra.subscriptionKey`.
 *
 * Pagination is cursor-based: pass `after: <endCursor>` to retrieve the
 * next page.  Each collection returns a `pageInfo { hasNextPage endCursor }`
 * object.  Max 100 records per page.
 */
import axios, { type AxiosInstance } from 'axios'
import { AF_GRAPHQL_URL } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export interface GqlResponse<T> {
  data: T
  errors?: Array<{ message: string }>
}

export interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

export class AccessFinancialsClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const subscriptionKey =
      (credentials.extra as Record<string, unknown> | undefined)?.['subscriptionKey'] as
        | string
        | undefined

    const headers: Record<string, string> = {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (subscriptionKey) {
      headers['Ocp-Apim-Subscription-Key'] = subscriptionKey
    }

    this.http = axios.create({ baseURL: AF_GRAPHQL_URL, headers })
  }

  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data: envelope } = await this.http.post<GqlResponse<T>>('', {
        query,
        variables: variables ?? {},
      })
      if (envelope.errors?.length) {
        throw new Error(`Access Financials GraphQL error: ${envelope.errors.map((e) => e.message).join('; ')}`)
      }
      return envelope.data
    })
  }
}
