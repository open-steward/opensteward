/**
 * Stitch GraphQL client.
 *
 * Every read is a POST of `{ query, variables }` to https://api.stitch.money/graphql
 * with the client token as a Bearer. The GraphQL server answers errors with
 * HTTP 200 and an `errors` array, so a body carrying `errors` is thrown.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

interface GraphQLResponse<T> {
  data?: T | null
  errors?: Array<{ message?: string }>
}

/** A Relay connection: `{ edges { node cursor } pageInfo { hasNextPage endCursor } }`. */
export interface Connection<T> {
  edges?: Array<{ node: T; cursor?: string }> | null
  pageInfo: { hasNextPage: boolean; endCursor?: string | null }
}

export class StitchClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async query<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const body = await withRetry(async () => {
      const { data } = await this.http.post<GraphQLResponse<T>>('', { query, variables })
      return data
    })
    if (body?.errors && body.errors.length > 0) {
      const msg = body.errors.map((e) => e.message ?? 'unknown error').join('; ')
      throw Object.assign(new Error(`Stitch GraphQL error: ${msg}`), { statusCode: 502 })
    }
    if (!body?.data)
      throw Object.assign(new Error('Stitch GraphQL response had no data'), { statusCode: 502 })
    return body.data
  }
}
