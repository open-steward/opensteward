import { pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
/**
 * Planhat adapter — Customer Success platform mapped to canonical CRM resources.
 *
 * Planhat uses different terminology:
 *   Enduser     → Contact
 *   Company     → Company
 *   Opportunity → Deal
 *   Conversation → Note
 *
 * Pipelines and Activities are not supported (501).
 *
 * Auth: API key passed as Bearer token. Config: { apiKey?: string }.
 * Docs: https://www.planhat.com/developers/api
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Note } from '../../schema/note'

import { PlanhatClient } from './client'
import {
  COMPANIES_MAX_PAGE_SIZE,
  CONVERSATIONS_MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  ENDUSERS_MAX_PAGE_SIZE,
  OPPORTUNITIES_MAX_PAGE_SIZE,
} from './constants'
import { verifyPlanhatWebhook, parsePlanhatWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawPlanhatContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawPlanhatCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawPlanhatDeal } from './transform/deal'
import { transformNote, untransformNote, type RawPlanhatNote } from './transform/note'

export interface PlanhatAdapterConfig {
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class PlanhatAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'planhat'
  readonly version = '0.1.0'

  private apiKey: string | undefined

  constructor(config: PlanhatAdapterConfig = {}) {
    this.apiKey = config.apiKey
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // API key auth — no OAuth flow
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: this.apiKey ?? '' }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPlanhatWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePlanhatWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): PlanhatClient {
    const effective: Credentials = this.apiKey ? { accessToken: this.apiKey } : credentials
    return new PlanhatClient(effective)
  }

  /**
   * One caller page of a documented offset list: `limit` clamped to the
   * endpoint's documented max, `offset` from the 1-based page at that size.
   * Planhat returns a bare array with no total, so a full page implies more.
   */
  private async listPaged<T>(
    credentials: Credentials,
    path: string,
    max: number,
    params: QueryParams,
  ): Promise<T[]> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, max)
    const { items, hasMore } = await this.client(credentials).list<T>(path, {
      limit,
      offset: pageOffset(params, limit),
    })
    reportUpstreamPage(params, { hasMore, pageSize: limit })
    return items
  }

  // ── Contacts (End users) ───────────────────────────────────────────────────
  // https://www.planhat.com/developers/api/enduser documents only the plural
  // path: "GET 'https://api.planhat.com/endusers?limit=2&offset=0'" and
  // "GET 'https://api.planhat.com/endusers/56bccdf554d64d837d01bf42'".

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPaged<RawPlanhatContact>(
      credentials,
      '/endusers',
      ENDUSERS_MAX_PAGE_SIZE,
      params,
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawPlanhatContact>(
      `/endusers/${encodeURIComponent(id)}`,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawPlanhatContact>(
      '/enduser',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawPlanhatContact>(
      `/enduser/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/enduser/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPaged<RawPlanhatCompany>(
      credentials,
      '/companies',
      COMPANIES_MAX_PAGE_SIZE,
      params,
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawPlanhatCompany>(`/companies/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawPlanhatCompany>(
      '/companies',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawPlanhatCompany>(
      `/companies/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPaged<RawPlanhatDeal>(
      credentials,
      '/opportunities',
      OPPORTUNITIES_MAX_PAGE_SIZE,
      params,
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawPlanhatDeal>(`/opportunities/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawPlanhatDeal>(
      '/opportunities',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawPlanhatDeal>(
      `/opportunities/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines — not supported ─────────────────────────────────────────────
  // listPipelines / getPipeline intentionally omitted → registry returns 501

  // ── Activities — not supported ────────────────────────────────────────────
  // All activity methods intentionally omitted → registry returns 501

  // ── Notes (Conversations) ─────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.listPaged<RawPlanhatNote>(
      credentials,
      '/conversations',
      CONVERSATIONS_MAX_PAGE_SIZE,
      params,
    )
    return items.map(transformNote)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawPlanhatNote>(
      '/conversations',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/conversations/${id}`)
  }

  // getNote / updateNote are not implemented (registry returns 501), although
  // https://www.planhat.com/developers/api/conversation documents both
  // ("GET 'https://api.planhat.com/conversations/58e57392c9437d10624593fd'"
  // and an update by _id). Adding them is outside the paging rebuild.
}
