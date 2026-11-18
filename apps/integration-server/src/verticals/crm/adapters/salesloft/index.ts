/**
 * Salesloft adapter for the CRM vertical.
 * Docs: https://developers.salesloft.com/api.html
 * ── Coverage ─────────────────────────────────────────────────────────────
 * Implemented (22): listContacts, getContact, createContact, updateContact,
 *   deleteContact, listCompanies, getCompany, createCompany, updateCompany,
 *   deleteCompany, listDeals, getDeal, createDeal, updateDeal, deleteDeal,
 *   listPipelines, getPipeline (synthesised from opportunity stages),
 *   listActivities, getActivity, createActivity, updateActivity, deleteActivity,
 *   listNotes, getNote, createNote, updateNote, deleteNote
 * Omitted (0) — registry returns HTTP 501 automatically: none
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'
import { pageLocally } from '@opensteward/shared'

import { SalesloftClient } from './client'
import { exchangeCode as _exchangeCode, refreshToken as _refreshToken } from './auth'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import { OAUTH_AUTH_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformContact,
  untransformContact,
  type RawSalesloftContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawSalesloftCompany,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawSalesloftDeal,
} from './transform/deal'
import {
  transformPipeline,
  type RawSalesloftStage,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawSalesloftActivity,
} from './transform/activity'
import {
  transformNote,
  untransformNote,
  type RawSalesloftNote,
} from './transform/note'

export interface SalesloftAdapterConfig {
  /** OAuth2 client id */
  clientId?: string
  /** OAuth2 client secret */
  clientSecret?: string
  /** OAuth2 redirect URI */
  redirectUri?: string
}

export class SalesloftAdapter implements CrmAdapter {
  readonly platform = 'salesloft'
  readonly version = '0.1.0'
  /** Every list endpoint documents per_page "in the range [1, 100]". */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: SalesloftAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const url = new URL(OAUTH_AUTH_URL)
    url.searchParams.set('client_id', this.clientId ?? '')
    url.searchParams.set('redirect_uri', this.redirectUri ?? '')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', state)
    return url.toString()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Salesloft exchangeCode: clientId and clientSecret required')
    }
    return _exchangeCode(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    if (!this.clientId || !this.clientSecret) return credentials
    return _refreshToken(credentials, this.clientId, this.clientSecret)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): SalesloftClient {
    return new SalesloftClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['page'] != null ? { page: params['page'] } : {}),
    }
  }

  // ── Contacts (People) ─────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawSalesloftContact>(
      '/people',
      this.pageParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawSalesloftContact>(`/people/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawSalesloftContact>(
      '/people',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawSalesloftContact>(
      `/people/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/people/${id}`)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawSalesloftCompany>(
      '/accounts',
      this.pageParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawSalesloftCompany>(`/accounts/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawSalesloftCompany>(
      '/accounts',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawSalesloftCompany>(
      `/accounts/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/accounts/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawSalesloftDeal>(
      '/opportunities',
      this.pageParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawSalesloftDeal>(`/opportunities/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawSalesloftDeal>(
      '/opportunities',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).put<RawSalesloftDeal>(
      `/opportunities/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines (synthesised from opportunity stages) ───────────────────────

  /**
   * Every opportunity stage. GET /v2/opportunity_stages pages by `page` +
   * `per_page` ("in the inclusive range [1, 100]") and ends when
   * metadata.paging.next_page is null. The walk builds ONE pipeline row, so it
   * is internal, not caller paging.
   */
  private async stages(credentials: Credentials): Promise<RawSalesloftStage[]> {
    const client = this.client(credentials)
    const all: RawSalesloftStage[] = []
    let page: number | undefined = 1
    while (page != null) {
      const res: { items: RawSalesloftStage[]; nextPage?: number } =
        await client.list<RawSalesloftStage>('/opportunity_stages', { per_page: MAX_PAGE_SIZE, page })
      all.push(...res.items)
      page = res.items.length > 0 && res.nextPage != null && res.nextPage > page ? res.nextPage : undefined
    }
    return all
  }

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // One pipeline built from every stage: page 2 is empty, not page 1 again.
    return pageLocally([transformPipeline(await this.stages(credentials))], params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    if (id !== 'default') {
      throw Object.assign(
        new Error(`Salesloft getPipeline: only 'default' pipeline exists`),
        { statusCode: 404 },
      )
    }
    return transformPipeline(await this.stages(credentials))
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawSalesloftActivity>(
      '/tasks',
      this.pageParams(params),
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawSalesloftActivity>(`/tasks/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawSalesloftActivity>(
      '/tasks',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).put<RawSalesloftActivity>(
      `/tasks/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/tasks/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawSalesloftNote>(
      '/notes',
      this.pageParams(params),
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawSalesloftNote>(`/notes/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawSalesloftNote>(
      '/notes',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(
    credentials: Credentials,
    id: string,
    data: Partial<Note>,
  ): Promise<Note> {
    const raw = await this.client(credentials).put<RawSalesloftNote>(
      `/notes/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
