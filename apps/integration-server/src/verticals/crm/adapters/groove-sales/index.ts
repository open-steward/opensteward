/**
 * Groove by Clari adapter — CRM resource coverage for the OpenSteward CRM vertical.
 *
 * Groove (now a Clari product) is a sales engagement platform whose v1 REST
 * API exposes two CRM-adjacent resources:
 *
 *   • People  →  canonical Contacts  (list / get / update)
 *   • Notes   →  canonical Notes     (list / get / create)
 *
 * The v1 API has no deals, companies, pipelines, or activities endpoints; those
 * methods are intentionally omitted and will auto-501 via the registry.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unverified: activity  — developer.groove.co unreachable (ECONNREFUSED); adapter
 *                         README states no /v1/activities endpoint; logged interactions
 *                         are internal-only.
 * Unverified: company   — developer.groove.co unreachable (ECONNREFUSED); adapter
 *                         README states no /v1/companies endpoint; company name is a
 *                         denormalised string on person records only.
 * Unverified: deal      — developer.groove.co unreachable (ECONNREFUSED); adapter
 *                         README states no /v1/deals or /v1/opportunities endpoint.
 * Unverified: pipeline  — developer.groove.co unreachable (ECONNREFUSED); adapter
 *                         README states no pipeline/stage management endpoints in v1.
 *
 * Auth:       OAuth 2.0 Authorization Code grant
 * Base URL:   https://api.groove.co/v1
 * Docs:       https://developer.groove.co/
 *
 * Pagination: page-number based (`page` / `per_page`, max 50).
 *             Responses carry a `meta.pagination` block; we expose the first
 *             page only per call (callers may iterate via `params.page`).
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Note } from '../../schema/note'

import { GrooveSalesClient } from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshToken as doRefreshToken,
} from './auth'
import {
  transformContact,
  untransformContact,
  type RawGrooveCustomer,
} from './transform/contact'
import {
  transformNote,
  untransformNote,
  type RawGrooveTicket,
} from './transform/note'
import {
  DEFAULT_GROOVE_SCOPES,
  GROOVE_DEFAULT_PAGE_SIZE,
  GROOVE_MAX_PAGE_SIZE,
} from './constants'

export interface GrooveSalesAdapterConfig {
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** OAuth scopes to request.  Defaults to DEFAULT_GROOVE_SCOPES. */
  scopes?: string[]
}

export class GrooveSalesAdapter implements CrmAdapter {
  readonly platform = 'groove-sales'
  readonly version = '0.1.0'

  /** Groove's `per_page` tops out at 50; the router and the sync worker ask for no more. */
  readonly capabilities = { maxPageSize: GROOVE_MAX_PAGE_SIZE }

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]

  constructor(config: GrooveSalesAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? [...DEFAULT_GROOVE_SCOPES]
  }

  // ── Credential fields (OAuth2) ─────────────────────────────────────────────

  credentialFields(): import('@opensteward/shared').CredentialField[] {
    return [
      { name: 'clientId', label: 'OAuth Client ID', type: 'text' as const, required: true },
      { name: 'clientSecret', label: 'OAuth Client Secret', type: 'password' as const, required: true },
      { name: 'redirectUri', label: 'Redirect URI', type: 'url' as const, required: true },
    ]
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      {
        clientId: this.clientId ?? '',
        clientSecret: this.clientSecret ?? '',
        redirectUri: this.redirectUri ?? '',
        scopes: overrideScopes ?? this.scopes,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Groove exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode(
      { clientId: this.clientId, clientSecret: this.clientSecret, redirectUri },
      code,
      redirectUri,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const extra = credentials.extra as Record<string, string> | undefined
    const clientId = this.clientId ?? extra?.['clientId'] ?? ''
    const clientSecret = this.clientSecret ?? extra?.['clientSecret'] ?? ''
    return doRefreshToken({ clientId, clientSecret }, credentials)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): GrooveSalesClient {
    return new GrooveSalesClient(credentials)
  }

  /** Map canonical QueryParams to Groove page / per_page query args. */
  private pageParams(params: QueryParams): { page: number; perPage: number } {
    // Canonical `cursor` is treated as a 1-based page number when numeric.
    const rawPage = params['cursor'] ?? params['page']
    const page = rawPage != null && !isNaN(Number(rawPage)) ? Number(rawPage) : 1
    const perPage = Math.min(
      params.limit ?? GROOVE_DEFAULT_PAGE_SIZE,
      GROOVE_MAX_PAGE_SIZE,
    )
    return { page, perPage }
  }

  // ── Contacts (Groove: /v1/people) ─────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { page, perPage } = this.pageParams(params)
    const { items } = await this.client(credentials).listPage<RawGrooveCustomer>(
      '/people',
      'people',
      page,
      perPage,
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<{ person: RawGrooveCustomer }>(
      `/people/${encodeURIComponent(id)}`,
    )
    return transformContact(res.person)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const res = await this.client(credentials).put<{ person: RawGrooveCustomer }>(
      `/people/${encodeURIComponent(id)}`,
      untransformContact(data),
    )
    return transformContact(res.person)
  }

  // ── Notes (Groove: /v1/notes) ──────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { page, perPage } = this.pageParams(params)
    const { items } = await this.client(credentials).listPage<RawGrooveTicket>(
      '/notes',
      'notes',
      page,
      perPage,
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<{ note: RawGrooveTicket }>(
      `/notes/${encodeURIComponent(id)}`,
    )
    return transformNote(res.note)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const res = await this.client(credentials).post<{ note: RawGrooveTicket }>(
      '/notes',
      untransformNote(data),
    )
    return transformNote(res.note)
  }
}
