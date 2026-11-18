/**
 * Saleor GraphQL client.
 *
 * Plain axios-based client — no graphql-request or urql dependency.
 *
 * Features:
 *  - `query<T>(gql, vars?)` — POST a GraphQL query, throw on errors.
 *  - `mutate<T>(gql, vars?)` — POST a mutation, throw on top-level AND
 *    mutation-level `errors[]` (Saleor convention).
 *  - `connectionPage<T>(gql, vars, dataKey)` — ONE page of a Relay
 *    connection: its nodes, and the cursor that starts the next page.
 *  - `paginateConnection<T>(gql, vars, dataKey)` — Relay cursor pagination
 *    that iterates `first/after` until `pageInfo.hasNextPage` is false.
 *  - 429 / 5xx retry with exponential backoff.
 */

import axios, { type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

// ── Retry helper ────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status != null && status >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

// ── GraphQL error types ─────────────────────────────────────────────────────

interface GqlError {
  message: string
  locations?: Array<{ line: number; column: number }>
  path?: string[]
  extensions?: Record<string, unknown>
}

interface GqlResponse<T> {
  data?: T
  errors?: GqlError[]
}

// ── Relay connection shape ──────────────────────────────────────────────────

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

interface Connection<T> {
  edges: Array<{ node: T }>
  pageInfo: PageInfo
}

// ── Client ──────────────────────────────────────────────────────────────────

export class SaleorClient {
  private apiUrl: string
  private token: string

  /** The store's GraphQL endpoint: the account half of a pager scope. */
  get endpoint(): string {
    return this.apiUrl
  }

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    this.apiUrl = extra['apiUrl'] ?? ''
    this.token = credentials.accessToken
    if (!this.apiUrl) {
      throw new Error('Saleor credentials must include extra.apiUrl')
    }
  }

  /**
   * Execute a GraphQL query and return `data`.
   * Throws if the response contains top-level `errors`.
   */
  async query<T>(gql: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data: res } = await axios.post<GqlResponse<T>>(
        this.apiUrl,
        { query: gql, variables },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      )

      if (res.errors && res.errors.length > 0) {
        throw new Error(`Saleor GraphQL error: ${res.errors.map((e) => e.message).join('; ')}`)
      }
      // A response with neither errors nor data is not a result: returning it
      // as `T` only moved the failure to a TypeError in the caller.
      if (res.data == null) {
        throw new Error('Saleor GraphQL response carried no data')
      }
      return res.data
    })
  }

  /**
   * Execute a GraphQL mutation and return `data`.
   * In addition to top-level errors, checks for Saleor's per-mutation
   * `errors` field (e.g. `productCreate.errors`).
   */
  async mutate<T>(gql: string, variables?: Record<string, unknown>): Promise<T> {
    const data = await this.query<T>(gql, variables)

    // Check per-mutation errors: each mutation result object may have an
    // `errors` array with `{ field, message, code }`.
    if (data && typeof data === 'object') {
      for (const value of Object.values(data as Record<string, unknown>)) {
        if (value && typeof value === 'object' && 'errors' in (value as Record<string, unknown>)) {
          const mutErrors = (value as Record<string, unknown>)['errors'] as
            Array<{ field?: string; message: string }> | undefined
          if (mutErrors && mutErrors.length > 0) {
            throw new Error(
              `Saleor mutation error: ${mutErrors.map((e) => `${e.field ?? ''}: ${e.message}`).join('; ')}`,
            )
          }
        }
      }
    }

    return data
  }

  /**
   * One page of a Relay connection.
   *
   * docs.saleor.io/api-usage/pagination: "hasNextPage: indicates if there
   * are more items to be fetched. Only calculated for queries using first."
   * and "endCursor: the cursor of the last item in edges. Use it as after to
   * paginate forwards." `next` is that cursor while `hasNextPage` holds.
   *
   * @param variables Must carry `first` (and `after` past page 1).
   */
  async connectionPage<T>(
    gql: string,
    variables: Record<string, unknown>,
    dataKey: string,
  ): Promise<{ items: T[]; next: string | null }> {
    const data = await this.query<Record<string, Connection<T> | null | undefined>>(gql, variables)
    const connection = data[dataKey]
    if (!connection) {
      throw new Error(`Saleor returned no \`${dataKey}\` connection`)
    }
    const items = connection.edges.map((edge) => edge.node)
    if (!connection.pageInfo.hasNextPage) return { items, next: null }
    if (!connection.pageInfo.endCursor) {
      throw new Error(`Saleor reported more \`${dataKey}\` but no endCursor to reach them`)
    }
    return { items, next: connection.pageInfo.endCursor }
  }

  /**
   * Paginate a Relay-style connection to completion and return a flat
   * array of nodes.
   *
   * @param gql       GraphQL query string (must accept `$first` and `$after`)
   * @param variables Base variables (must include `first`).
   * @param dataKey   Top-level field name in the data object (e.g. `'products'`).
   */
  async paginateConnection<T>(
    gql: string,
    variables: Record<string, unknown>,
    dataKey: string,
  ): Promise<T[]> {
    const results: T[] = []
    let after: string | null = null
    const first = Math.min(
      (variables['first'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )

    for (;;) {
      const vars: Record<string, unknown> = { ...variables, first, after }
      const data: Record<string, Connection<T>> = await this.query<Record<string, Connection<T>>>(
        gql,
        vars,
      )
      const connection: Connection<T> | undefined = data[dataKey]
      if (!connection || !connection.edges) break

      for (const edge of connection.edges) {
        results.push(edge.node)
      }

      if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break
      after = connection.pageInfo.endCursor
    }

    return results
  }
}
