import { simpleApiKey } from '@opensteward/shared'
/**
 * Brevo (formerly Sendinblue) adapter for the CRM vertical.
 *
 * Maps the Brevo CRM REST API to canonical CRM resources.
 * Docs: https://developers.brevo.com/reference
 *
 * Auth: API key via `api-key` header
 * Notable:
 *   - French email marketing / CRM platform
 *   - Contact attributes stored in flat key/value map (FIRSTNAME, LASTNAME, SMS)
 *   - Full CRM: contacts, companies, deals, pipelines, notes, tasks/activities
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (20):
 *   Contacts: list, get, create, update, delete
 *   Companies: list, get, create, update, delete
 *   Deals: list, get, create, update, delete
 *   Pipelines: list
 *   Activities (Tasks): list, get, create
 *   Notes: list, get, create
 *   Webhooks: verifyWebhook (stub), parseWebhookEvents (stub)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { BrevoClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawBrevoContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawBrevoCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawBrevoDeal } from './transform/deal'
import { transformPipeline, type RawBrevoPipeline } from './transform/pipeline'
import { transformActivity, untransformActivity, type RawBrevoActivity } from './transform/activity'
import { transformNote, untransformNote, type RawBrevoNote } from './transform/note'

export interface BrevoAdapterConfig {
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BrevoAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'brevo'
  readonly version = '0.1.0'

  constructor(_config: BrevoAdapterConfig = {}) {}

  // ── Auth (API key — no OAuth flow) ────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: '' }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): BrevoClient {
    return new BrevoClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    const offset = (page - 1) * limit
    return { limit, offset }
  }

  // GET /companies paginates by `page`, not `offset` — it has no offset param.
  private pageParams(params: QueryParams): Record<string, unknown> {
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    return { limit, page }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const p = this.listParams(params)
    const res = await this.client(credentials).get<{ contacts: RawBrevoContact[] }>('/contacts', p)
    return (res.contacts ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawBrevoContact>(`/contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const created = await this.client(credentials).post<{ id: number }>('/contacts', body)
    return this.getContact(credentials, String(created.id))
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    await this.client(credentials).put<void>(`/contacts/${id}`, body)
    return this.getContact(credentials, id)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const p = this.pageParams(params)
    const res = await this.client(credentials).get<{ items: RawBrevoCompany[] }>('/companies', p)
    return (res.items ?? []).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawBrevoCompany>(`/companies/${id}`)
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const created = await this.client(credentials).post<{ id: string }>('/companies', body)
    return this.getCompany(credentials, created.id)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    await this.client(credentials).patch<void>(`/companies/${id}`, body)
    return this.getCompany(credentials, id)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const p = this.listParams(params)
    const res = await this.client(credentials).get<{ items: RawBrevoDeal[] }>('/crm/deals', p)
    return (res.items ?? []).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<RawBrevoDeal>(`/crm/deals/${id}`)
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const created = await this.client(credentials).post<{ id: string }>('/crm/deals', body)
    return this.getDeal(credentials, created.id)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    await this.client(credentials).patch<void>(`/crm/deals/${id}`, body)
    return this.getDeal(credentials, id)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/crm/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    const res = await this.client(credentials).get<RawBrevoPipeline[]>('/crm/pipeline/details/all')
    return (res ?? []).map(transformPipeline)
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const p = this.listParams(params)
    const res = await this.client(credentials).get<{ items: RawBrevoActivity[] }>('/crm/tasks', p)
    return (res.items ?? []).map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawBrevoActivity>(`/crm/tasks/${id}`)
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const created = await this.client(credentials).post<{ id: string }>('/crm/tasks', body)
    return this.getActivity(credentials, created.id)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const p = this.listParams(params)
    const res = await this.client(credentials).get<RawBrevoNote[]>('/crm/notes', p)
    return (res ?? []).map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<RawBrevoNote>(`/crm/notes/${id}`)
    return transformNote(res)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const created = await this.client(credentials).post<{ id: string }>('/crm/notes', body)
    return this.getNote(credentials, created.id)
  }
}
