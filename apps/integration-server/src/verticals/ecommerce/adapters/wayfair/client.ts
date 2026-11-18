/**
 * Wayfair GraphQL API client.
 *
 * Features:
 *  - `Authorization: Bearer <token>` header.
 *  - GraphQL over HTTP POST to a single endpoint.
 *  - Simple 429/503 retry with exponential backoff via the shared `withRetry`.
 *
 * Wayfair's API is GraphQL — not REST. Each API has one URL:
 *   Purchase Order API (v1, reads and writes):
 *     Production: https://api.wayfair.com/v1/graphql
 *     Sandbox:    https://sandbox.api.wayfair.com/v1/graphql
 *   Dropship Orders API (v2, read-only, cursor-paged):
 *     Production: https://api.wayfair.io/2026-09/dropship-orders/graphql
 *     Sandbox:    https://api.wayfair.io/sandbox/2026-09/dropship-orders/graphql
 *
 * Docs: https://developer.wayfair.io
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { PROD_GRAPHQL_URL, SANDBOX_GRAPHQL_URL } from './constants'

export interface GraphQLError {
  message: string
  locations?: unknown
  path?: unknown
  extensions?: { code?: string; [key: string]: unknown }
}

export interface GraphQLResponse<T> {
  data?: T | null
  errors?: GraphQLError[]
}

export interface WayfairClientOptions {
  /** GraphQL endpoint; defaults to the v1 Purchase Order API for the environment. */
  endpoint?: string
  /**
   * Sent as `WF-Supplier-Id`. Dropship Orders API reference, verbatim:
   * "WF-Supplier-Id is required when the access token has no supplier claim,
   * or when a delegated application is acting for a supplier."
   */
  supplierId?: number
  /**
   * `extensions.code` values the endpoint documents as still serving `data`.
   * A response whose errors all carry one of these, and whose `data` is
   * non-null, is returned instead of thrown. Empty by default: only the
   * Dropship Orders API (v2) documents such a code.
   */
  servedWithErrorCodes?: ReadonlySet<string>
}

/**
 * Dropship Orders API reference, verbatim: selecting a PII address field
 * without `orders:read-dropship-orders-pii` "serves the page with those fields
 * null and adds a single errors entry, extensions.code: FORBIDDEN_SCOPE". The
 * page is still data, so that one code does not fail a v2 read.
 */
export const DROPSHIP_ORDERS_SERVED_WITH_ERRORS: ReadonlySet<string> = new Set(['FORBIDDEN_SCOPE'])

export class WayfairClient {
  private http: AxiosInstance
  private servedWithErrorCodes: ReadonlySet<string>

  constructor(
    credentials: Credentials,
    sandbox: boolean = false,
    options: WayfairClientOptions = {},
  ) {
    this.servedWithErrorCodes = options.servedWithErrorCodes ?? new Set()
    const baseURL = options.endpoint ?? (sandbox ? SANDBOX_GRAPHQL_URL : PROD_GRAPHQL_URL)
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.supplierId != null ? { 'WF-Supplier-Id': String(options.supplierId) } : {}),
      },
      timeout: 30_000,
    })
  }

  /**
   * Execute a GraphQL operation and return `data` from the response.
   * Throws if the response contains a top-level `errors` array, unless every
   * error is one the API documents as serving the page anyway.
   */
  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data: body } = await this.http.post<GraphQLResponse<T>>('', {
        query,
        variables: variables ?? {},
      })

      const errors = body.errors ?? []
      const served =
        body.data != null &&
        errors.every((e) => this.servedWithErrorCodes.has(e.extensions?.code ?? ''))
      if (errors.length > 0 && !served) {
        const msg = errors.map((e) => e.message).join('; ')
        throw new Error(`Wayfair GraphQL error: ${msg}`)
      }

      return body.data as T
    })
  }
}
