import { simpleApiKey, pageLocally } from '@opensteward/shared'
/**
 * Agendor CRM adapter for the CRM vertical.
 *
 * Maps the Agendor REST API v3 to canonical CRM resources.
 * Docs: https://developers.agendor.com.br/
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (22):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete
 *   Pipelines:  list, get
 *   Activities: list, get, create, update, delete
 *   Notes:      list, create
 *
 * Auth: API key sent as `Authorization: Token <key>` header
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { AgendorClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawAgendorContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawAgendorCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawAgendorDeal } from './transform/deal'
import { transformPipeline, type RawAgendorPipeline } from './transform/pipeline'
import { transformActivity, untransformActivity, type RawAgendorActivity } from './transform/activity'
import { transformNote, untransformNote, type RawAgendorNote } from './transform/note'

export interface AgendorAdapterConfig {
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class AgendorAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'agendor'
  readonly version = '0.1.0'

  private apiKey: string | undefined

  constructor(config: AgendorAdapterConfig = {}) {
    this.apiKey = config.apiKey
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.apiKey) throw new Error('Agendor: apiKey required')
    return { accessToken: this.apiKey }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private c(creds: Credentials): AgendorClient {
    return new AgendorClient(this.apiKey ? { accessToken: this.apiKey } : creds)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params['limit'] ?? DEFAULT_PAGE_SIZE,
      page: params['page'] ?? 1,
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.c(credentials).list<RawAgendorContact>('/people', this.listParams(params))
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.c(credentials).get<RawAgendorContact>(`/people/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.c(credentials).post<RawAgendorContact>('/people', untransformContact(data))
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.c(credentials).put<RawAgendorContact>(`/people/${id}`, untransformContact(data))
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/people/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.c(credentials).list<RawAgendorCompany>('/organizations', this.listParams(params))
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.c(credentials).get<RawAgendorCompany>(`/organizations/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.c(credentials).post<RawAgendorCompany>('/organizations', untransformCompany(data))
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const raw = await this.c(credentials).put<RawAgendorCompany>(`/organizations/${id}`, untransformCompany(data))
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/organizations/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.c(credentials).list<RawAgendorDeal>('/deals', this.listParams(params))
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.c(credentials).get<RawAgendorDeal>(`/deals/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).post<RawAgendorDeal>('/deals', untransformDeal(data))
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).put<RawAgendorDeal>(`/deals/${id}`, untransformDeal(data))
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * GET /funnels is unpaginated: the v3 swagger declares no parameters for it
   * ("List all funnels in your account."), so it is fetched whole, without the
   * page/per_page defaults `list()` adds, and paged locally.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const raw = await this.c(credentials).get<RawAgendorPipeline[] | undefined>('/funnels')
    return pageLocally((raw ?? []).map(transformPipeline), params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.c(credentials).get<RawAgendorPipeline>(`/funnels/${id}`)
    return transformPipeline(raw)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.c(credentials).list<RawAgendorActivity>('/tasks', this.listParams(params))
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.c(credentials).get<RawAgendorActivity>(`/tasks/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.c(credentials).post<RawAgendorActivity>('/tasks', untransformActivity(data))
    return transformActivity(raw)
  }

  async updateActivity(credentials: Credentials, id: string, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.c(credentials).put<RawAgendorActivity>(`/tasks/${id}`, untransformActivity(data))
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/tasks/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.c(credentials).list<RawAgendorNote>('/notes', this.listParams(params))
    return items.map(transformNote)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).post<RawAgendorNote>('/notes', untransformNote(data))
    return transformNote(raw)
  }
}
