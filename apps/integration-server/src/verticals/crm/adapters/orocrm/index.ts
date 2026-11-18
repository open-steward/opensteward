/**
 * OroCRM adapter — CRM resource coverage for the OpenSteward CRM vertical.
 *
 * Maps the OroCRM JSON:API to canonical CRM resources (contacts, accounts →
 * companies, opportunities → deals, tasks → activities, notes).
 *
 * OroCRM is self-hosted. The `baseUrl` config option points to the customer's
 * OroCRM installation (e.g. https://crm.example.com).
 *
 * Auth: OAuth2 authorization-code flow.
 *   Authorization URL: {baseUrl}/oauth2-token/authorize
 *   Token URL:         {baseUrl}/oauth2-token
 *   Bearer token in Authorization header for every API request.
 *
 * Pagination: JSON:API page-based — page[number] (1-indexed) + page[size].
 *
 * Webhooks: OroCRM does not publish a documented inbound webhook API for
 * external consumers; webhook methods are intentionally not implemented
 * (registry returns 501 automatically).
 *
 * Docs: https://doc.oroinc.com/backend/api/
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'
import type { Pipeline } from '../../schema/pipeline'

import type { CredentialField } from '@opensteward/shared'
import { OrocrmClient } from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  normaliseBaseUrl,
  refreshToken as doRefreshToken,
} from './auth'
import { transformContact, untransformContact } from './transform/contact'
import { transformCompany, untransformCompany } from './transform/company'
import { transformDeal, untransformDeal } from './transform/deal'
import { transformActivity, untransformActivity } from './transform/activity'
import { transformNote, untransformNote } from './transform/note'
import {
  transformPipeline,
  type RawOrocrmWorkflowStep,
} from './transform/pipeline'
import { DEFAULT_PAGE_SIZE } from './constants'

export interface OrocrmAdapterConfig {
  /**
   * Customer's OroCRM installation URL, e.g. https://crm.example.com
   * Required at construction time for getAuthUrl(); can also be stored in
   * credentials.extra.baseUrl after the initial OAuth exchange.
   */
  baseUrl?: string
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** Optional OAuth scopes. OroCRM's available scopes depend on installed bundles. */
  scopes?: string[]
}

export class OrocrmAdapter implements CrmAdapter {
  readonly platform = 'orocrm'
  readonly version = '0.1.0'

  /** Deployment-wide fallback. Per-customer installations arrive via `oauthFields`. */
  private baseUrl: string | undefined
  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]

  constructor(config: OrocrmAdapterConfig = {}) {
    this.baseUrl = config.baseUrl
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * OroCRM is self-hosted: authorize, token and API live on the customer's
   * installation, which deployment config cannot know. Asked for on the
   * Connect page before the redirect, then read back from `credentials.extra.baseUrl`.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'baseUrl',
        label: 'OroCRM URL',
        type: 'url',
        required: true,
        placeholder: 'https://crm.example.com',
        helpText: 'The https:// address of your OroCRM installation.',
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      {
        baseUrl: this.resolveBaseUrl(inputs?.baseUrl),
        clientId: this.clientId ?? '',
        clientSecret: this.clientSecret ?? '',
        redirectUri: this.redirectUri ?? '',
        scopes: overrideScopes ?? this.scopes,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return this.exchange(code, redirectUri, this.resolveBaseUrl())
  }

  /** Exchange on the customer's installation and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return this.exchange(code, redirectUri, this.resolveBaseUrl(inputs.baseUrl))
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const extra = credentials.extra ?? {}
    const clientId = this.clientId || (typeof extra['clientId'] === 'string' ? extra['clientId'] : '')
    const clientSecret =
      this.clientSecret || (typeof extra['clientSecret'] === 'string' ? extra['clientSecret'] : '')
    return doRefreshToken(
      { baseUrl: this.storedBaseUrl(credentials), clientId, clientSecret },
      credentials,
    )
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async exchange(code: string, redirectUri: string, baseUrl: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('OroCRM exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode(
      {
        baseUrl,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        redirectUri,
      },
      code,
      redirectUri,
    )
  }

  /** The customer's installation when supplied, else the deployment-wide one — normalised or a readable error. */
  private resolveBaseUrl(candidate?: string): string {
    return normaliseBaseUrl(candidate ?? this.baseUrl)
  }

  /** The installation recorded with the credentials at exchange, else the deployment-wide one. */
  private storedBaseUrl(credentials: Credentials): string | undefined {
    const stored = credentials.extra?.['baseUrl']
    return typeof stored === 'string' ? stored : this.baseUrl
  }

  private client(credentials: Credentials): OrocrmClient {
    // The client resolves the API host from credentials.extra.baseUrl; hand it
    // the normalised installation so a stale or missing value fails readably.
    const baseUrl = normaliseBaseUrl(this.storedBaseUrl(credentials))
    return new OrocrmClient({
      ...credentials,
      extra: { ...(credentials.extra ?? {}), baseUrl },
    })
  }

  private pageParams(params: QueryParams): { pageNumber: number; pageSize: number } {
    return {
      pageNumber: typeof params['page'] === 'number' ? (params['page'] as number) : 1,
      pageSize: typeof params['limit'] === 'number' ? (params['limit'] as number) : DEFAULT_PAGE_SIZE,
    }
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const { items } = await this.client(credentials).list('/contacts', pageNumber, pageSize)
    return items.map((r) => transformContact(r))
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const record = await this.client(credentials).get(`/contacts/${id}`)
    const accountRel = record.relationships?.['account']?.data
    const accountId = accountRel && !Array.isArray(accountRel)
      ? (accountRel as { id: string }).id
      : undefined
    return transformContact(record, accountId)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const record = await this.client(credentials).post('/contacts', untransformContact(data))
    return transformContact(record)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const record = await this.client(credentials).patch(`/contacts/${id}`, {
      data: { ...(body.data as Record<string, unknown>), id },
    })
    return transformContact(record)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (OroCRM: accounts) ──────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const { items } = await this.client(credentials).list('/accounts', pageNumber, pageSize)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const record = await this.client(credentials).get(`/accounts/${id}`)
    return transformCompany(record)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const record = await this.client(credentials).post('/accounts', untransformCompany(data))
    return transformCompany(record)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const record = await this.client(credentials).patch(`/accounts/${id}`, {
      data: { ...(body.data as Record<string, unknown>), id },
    })
    return transformCompany(record)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/accounts/${id}`)
  }

  // ── Deals (OroCRM: opportunities) ─────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const { items } = await this.client(credentials).list('/opportunities', pageNumber, pageSize)
    return items.map((r) => transformDeal(r))
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const record = await this.client(credentials).get(`/opportunities/${id}`)
    return transformDeal(record)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const record = await this.client(credentials).post('/opportunities', untransformDeal(data))
    return transformDeal(record)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const body = untransformDeal(data)
    const record = await this.client(credentials).patch(`/opportunities/${id}`, {
      data: { ...(body.data as Record<string, unknown>), id },
    })
    return transformDeal(record)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Activities (OroCRM: tasks) ────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const { items } = await this.client(credentials).list('/tasks', pageNumber, pageSize)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const record = await this.client(credentials).get(`/tasks/${id}`)
    return transformActivity(record)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const record = await this.client(credentials).post('/tasks', untransformActivity(data))
    return transformActivity(record)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const body = untransformActivity(data)
    const record = await this.client(credentials).patch(`/tasks/${id}`, {
      data: { ...(body.data as Record<string, unknown>), id },
    })
    return transformActivity(record)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/tasks/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const { items } = await this.client(credentials).list('/notes', pageNumber, pageSize)
    return items.map((r) => transformNote(r))
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const record = await this.client(credentials).get(`/notes/${id}`)
    return transformNote(record)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const record = await this.client(credentials).post('/notes', untransformNote(data))
    return transformNote(record)
  }

  async updateNote(
    credentials: Credentials,
    id: string,
    data: Partial<Note>,
  ): Promise<Note> {
    const body = untransformNote(data)
    const record = await this.client(credentials).patch(`/notes/${id}`, {
      data: { ...(body.data as Record<string, unknown>), id },
    })
    return transformNote(record)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }

  // ── Pipelines (OroCRM: workflow definitions) ──────────────────────────────

  /**
   * List sales-opportunity workflow definitions as canonical Pipelines.
   * OroCRM exposes workflow definitions via GET /api/workflowdefinitions.
   * Each definition that applies to opportunities is surfaced as a pipeline.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const { items } = await this.client(credentials).list(
      '/workflowdefinitions',
      pageNumber,
      pageSize,
    )
    return items.map((record) => {
      const steps = (record.attributes?.['steps'] ?? []) as RawOrocrmWorkflowStep[]
      return transformPipeline(record, steps)
    })
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const record = await this.client(credentials).get(`/workflowdefinitions/${id}`)
    const steps = (record.attributes?.['steps'] ?? []) as RawOrocrmWorkflowStep[]
    return transformPipeline(record, steps)
  }
}
