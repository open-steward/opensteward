/**
 * Crystallize GraphQL client.
 *
 * Crystallize has separate endpoints for catalogue (read), PIM (write),
 * and orders. This client abstracts over all three.
 *
 * Features:
 *  - `catalogueQuery<T>(gql, vars?)` — query the catalogue API
 *  - `pimMutate<T>(gql, vars?)` — mutate via the PIM API
 *  - `orderQuery<T>(gql, vars?)` — query the order API
 *  - `orderMutate<T>(gql, vars?)` — mutate via the order API
 *  - 429 / 5xx retry with exponential backoff
 */

import axios, { type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { CATALOGUE_API, PIM_API } from './constants'
import { normaliseTenantIdentifier } from './auth'

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

// ── Client ──────────────────────────────────────────────────────────────────

export class CrystallizeClient {
  private tenantIdentifier: string
  private token: string

  /** Set for connections made through the credential form; `token` is then the secret. */
  private accessTokenId: string | undefined

  constructor(credentials: Credentials) {
    const extra = credentials.extra ?? {}
    // Throws for a blank or path-unsafe tenant, before any request is built.
    this.tenantIdentifier = normaliseTenantIdentifier(extra['tenantIdentifier'])
    this.token = credentials.accessToken
    const tokenId = extra['accessTokenId']
    this.accessTokenId = typeof tokenId === 'string' && tokenId ? tokenId : undefined
  }

  /** The tenant identifier for URL building. */
  get tenant(): string {
    return this.tenantIdentifier
  }

  // ── Catalogue API (read) ────────────────────────────────────────────────

  private get catalogueUrl(): string {
    return `${CATALOGUE_API}/${this.tenantIdentifier}/catalogue`
  }

  // ── PIM API (write) ─────────────────────────────────────────────────────

  private get pimUrl(): string {
    return `${PIM_API}/${this.tenantIdentifier}/graphql`
  }

  // ── Order API ───────────────────────────────────────────────────────────

  private get orderUrl(): string {
    return `${CATALOGUE_API}/${this.tenantIdentifier}/orders`
  }

  // ── Generic request ─────────────────────────────────────────────────────

  private async request<T>(
    url: string,
    gql: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    return withRetry(async () => {
      const { data: res } = await axios.post<GqlResponse<T>>(
        url,
        { query: gql, variables },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(this.accessTokenId
              ? {
                  'X-Crystallize-Access-Token-Id': this.accessTokenId,
                  'X-Crystallize-Access-Token-Secret': this.token,
                }
              : {
                  // Connections stored before the token pair was collected.
                  Authorization: `Bearer ${this.token}`,
                  'X-Crystallize-Access-Token-Id': this.token,
                }),
          },
          timeout: 30_000,
        },
      )

      if (res.errors && res.errors.length > 0) {
        throw new Error(`Crystallize GraphQL error: ${res.errors.map((e) => e.message).join('; ')}`)
      }
      return res.data as T
    })
  }

  /**
   * Execute a catalogue (read) query.
   */
  async catalogueQuery<T>(gql: string, variables?: Record<string, unknown>): Promise<T> {
    return this.request<T>(this.catalogueUrl, gql, variables)
  }

  /**
   * Execute a PIM (write) mutation. Also checks per-mutation error arrays.
   */
  async pimMutate<T>(gql: string, variables?: Record<string, unknown>): Promise<T> {
    const data = await this.request<T>(this.pimUrl, gql, variables)
    this.checkMutationErrors(data)
    return data
  }

  /**
   * Execute an order API query.
   */
  async orderQuery<T>(gql: string, variables?: Record<string, unknown>): Promise<T> {
    return this.request<T>(this.orderUrl, gql, variables)
  }

  /**
   * Execute an order API mutation.
   */
  async orderMutate<T>(gql: string, variables?: Record<string, unknown>): Promise<T> {
    const data = await this.request<T>(this.orderUrl, gql, variables)
    this.checkMutationErrors(data)
    return data
  }

  /**
   * Check per-mutation errors in Crystallize convention.
   */
  private checkMutationErrors<T>(data: T): void {
    if (data && typeof data === 'object') {
      for (const value of Object.values(data as Record<string, unknown>)) {
        if (value && typeof value === 'object' && 'errors' in (value as Record<string, unknown>)) {
          const mutErrors = (value as Record<string, unknown>)['errors'] as
            | Array<{ field?: string; message: string }>
            | undefined
          if (mutErrors && mutErrors.length > 0) {
            throw new Error(
              `Crystallize mutation error: ${mutErrors.map((e) => `${e.field ?? ''}: ${e.message}`).join('; ')}`,
            )
          }
        }
      }
    }
  }
}
