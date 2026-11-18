/**
 * Kommo adapter — OAuth2 CRM integration.
 *
 * Coverage:
 *   contacts   — list, get, create, update, delete
 *   companies  — list, get, create, update, delete
 *   deals      — list, get, create, update, delete  (Kommo "leads")
 *   pipelines  — list, get
 *   activities — list, get, create, update, delete  (Kommo "tasks")
 *   notes      — list, get, create, update, delete
 *   webhooks   — HMAC-SHA1 verification via X-Signature header
 *
 * Auth: OAuth2 Authorization Code. The account subdomain is read from
 * `credentials.extra.subdomain`; `clientId` / `clientSecret` are sourced from
 * `credentials.extra` as well (stored there during the initial token exchange).
 *
 * Docs: https://www.kommo.com/developers/
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { KommoClient } from './client'
import { buildAuthUrl, exchangeCode, refreshToken } from './auth'
import { verifyKommoWebhook, parseKommoWebhookEvents } from './webhook'
import { KOMMO_DEFAULT_LIMIT } from './constants'

import { transformContact, untransformContact, type RawKommoContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawKommoCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawKommoDeal } from './transform/deal'
import { transformPipeline, type RawKommoPipeline } from './transform/pipeline'
import { transformActivity, untransformActivity, type RawKommoTask } from './transform/activity'
import { transformNote, untransformNote, type RawKommoNote } from './transform/note'

export interface KommoAdapterConfig {
  /** OAuth2 client id */
  clientId?: string
  /** OAuth2 client secret */
  clientSecret?: string
  /** OAuth2 redirect URI */
  redirectUri?: string
}

export class KommoAdapter implements CrmAdapter {
  readonly platform = 'kommo'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: KommoAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * Build the Kommo OAuth2 URL.
   *
   * Because the auth URL is subdomain-specific the subdomain must either be
   * known up-front via config or passed as the `state` payload. For the common
   * case where the subdomain is not known until the user provides it, fall back
   * to the generic `www.kommo.com` host.
   */
  getAuthUrl(state: string, _overrideScopes?: string[]): string {
    const subdomain = 'www'
    return buildAuthUrl({
      subdomain,
      clientId: this.clientId ?? '',
      redirectUri: this.redirectUri ?? '',
      state,
    })
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Kommo exchangeCode: clientId and clientSecret required')
    }
    return exchangeCode({
      // subdomain is not known here — Kommo redirects back to redirectUri with the code
      subdomain: 'www',
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUri,
      code,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshToken(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyKommoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseKommoWebhookEvents(payload)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): KommoClient {
    return new KommoClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? KOMMO_DEFAULT_LIMIT,
      page: params['page'] ?? params['cursor'] ?? 1,
    }
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawKommoContact>(
      '/contacts',
      'contacts',
      this.pageParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawKommoContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<{
      _embedded: { contacts: RawKommoContact[] }
    }>('/contacts', [body])
    const created = res._embedded.contacts[0]
    if (!created) throw new Error('Kommo: createContact returned no data')
    return transformContact(created)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).patch<RawKommoContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawKommoCompany>(
      '/companies',
      'companies',
      this.pageParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawKommoCompany>(`/companies/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<{
      _embedded: { companies: RawKommoCompany[] }
    }>('/companies', [body])
    const created = res._embedded.companies[0]
    if (!created) throw new Error('Kommo: createCompany returned no data')
    return transformCompany(created)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).patch<RawKommoCompany>(
      `/companies/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals (Leads) ──────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawKommoDeal>(
      '/leads',
      'leads',
      this.pageParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawKommoDeal>(`/leads/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<{
      _embedded: { leads: RawKommoDeal[] }
    }>('/leads', [body])
    const created = res._embedded.leads[0]
    if (!created) throw new Error('Kommo: createDeal returned no data')
    return transformDeal(created)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).patch<RawKommoDeal>(
      `/leads/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/leads/${id}`)
  }

  // ── Pipelines ──────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const { items } = await this.client(credentials).list<RawKommoPipeline>(
      '/leads/pipelines',
      'pipelines',
      this.pageParams(params),
    )
    return items.map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawKommoPipeline>(`/leads/pipelines/${id}`)
    return transformPipeline(raw)
  }

  // ── Activities (Tasks) ─────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawKommoTask>(
      '/tasks',
      'tasks',
      this.pageParams(params),
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawKommoTask>(`/tasks/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<{
      _embedded: { tasks: RawKommoTask[] }
    }>('/tasks', [body])
    const created = res._embedded.tasks[0]
    if (!created) throw new Error('Kommo: createActivity returned no data')
    return transformActivity(created)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).patch<RawKommoTask>(
      `/tasks/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/tasks/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    // List notes across all leads (most common query pattern)
    const entityType = (params['entity_type'] as string | undefined) ?? 'leads'
    const { items } = await this.client(credentials).list<RawKommoNote>(
      '/notes',
      'notes',
      {
        entity_type: entityType,
        ...this.pageParams(params),
      },
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawKommoNote>(`/notes/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)

    // Determine whether to create on a lead or contact
    const entityType = data.deal_id ? 'leads' : 'contacts'
    const entityId = data.deal_id ?? data.contact_id
    if (!entityId) throw new Error('Kommo createNote: deal_id or contact_id required')

    const res = await this.client(credentials).post<{
      _embedded: { notes: RawKommoNote[] }
    }>(`/${entityType}/${entityId}/notes`, [body])
    const created = res._embedded.notes[0]
    if (!created) throw new Error('Kommo: createNote returned no data')
    return transformNote(created)
  }

  async updateNote(
    credentials: Credentials,
    id: string,
    data: Partial<Note>,
  ): Promise<Note> {
    const body = untransformNote(data)
    const entityType = data.deal_id ? 'leads' : 'contacts'
    const entityId = data.deal_id ?? data.contact_id
    if (!entityId) throw new Error('Kommo updateNote: deal_id or contact_id required')
    const raw = await this.client(credentials).patch<RawKommoNote>(
      `/${entityType}/${entityId}/notes/${id}`,
      body,
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    // Notes delete endpoint requires knowing the entity — use generic notes path
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
