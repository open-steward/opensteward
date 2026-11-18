import { simpleApiKey } from '@opensteward/shared'
/**
 * OnePageCRM adapter for the CRM vertical.
 *
 * Maps the OnePageCRM REST API to canonical CRM resources.
 * Docs: https://developer.onepagecrm.com/api/
 *
 * Auth: Basic Auth — base64(user_id + ":" + api_key)
 *   credentials.accessToken = user_id
 *   credentials.extra.apiKey = api_key
 * Base URL: https://app.onepagecrm.com/api/v3/
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts: list, get, create, update, delete
 *   Companies: list, get, create, update, delete
 *   Deals: list, get, create, update, delete
 *   Activities (Actions): list, get, create, update, delete
 *   Notes: list, get, create
 *   Pipelines: not supported by OnePageCRM (action-based workflow)
 *   Webhooks: stub
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { OnePageCrmClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawOnePageCrmContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawOnePageCrmCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawOnePageCrmDeal } from './transform/deal'
import { transformActivity, untransformActivity, type RawOnePageCrmAction } from './transform/activity'
import { transformNote, untransformNote, type RawOnePageCrmNote } from './transform/note'

// no OAuth config needed — API key auth
export type OnePageCrmAdapterConfig = Record<string, never>
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class OnePageCrmAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'onepagecrm'
  readonly version = '0.1.0'

  constructor(_config: OnePageCrmAdapterConfig = {}) {}

  // ── Auth (API Key stub) ───────────────────────────────────────────────────

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

  private client(credentials: Credentials): OnePageCrmClient {
    return new OnePageCrmClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
      page: Number(params['page'] ?? 1),
    }
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawOnePageCrmContact>(
      '/contacts',
      this.listParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<{ data?: { contact?: RawOnePageCrmContact } }>(`/contacts/${id}`)
    const raw = res?.data?.contact ?? (res as unknown as RawOnePageCrmContact)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawOnePageCrmContact>('/contacts', { contact: body })
    return transformContact(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawOnePageCrmContact>(`/contacts/${id}`, { contact: body })
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawOnePageCrmCompany>(
      '/companies',
      this.listParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<{ data?: { company?: RawOnePageCrmCompany } }>(`/companies/${id}`)
    const raw = res?.data?.company ?? (res as unknown as RawOnePageCrmCompany)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawOnePageCrmCompany>('/companies', { company: body })
    return transformCompany(res)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawOnePageCrmCompany>(`/companies/${id}`, { company: body })
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals ──────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawOnePageCrmDeal>(
      '/deals',
      this.listParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<{ data?: { deal?: RawOnePageCrmDeal } }>(`/deals/${id}`)
    const raw = res?.data?.deal ?? (res as unknown as RawOnePageCrmDeal)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawOnePageCrmDeal>('/deals', { deal: body })
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawOnePageCrmDeal>(`/deals/${id}`, { deal: body })
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Activities (Actions in OnePageCRM) ────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawOnePageCrmAction>(
      '/actions',
      this.listParams(params),
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<{ data?: { action?: RawOnePageCrmAction } }>(`/actions/${id}`)
    const raw = res?.data?.action ?? (res as unknown as RawOnePageCrmAction)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawOnePageCrmAction>('/actions', { action: body })
    return transformActivity(res)
  }

  async updateActivity(credentials: Credentials, id: string, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).put<RawOnePageCrmAction>(`/actions/${id}`, { action: body })
    return transformActivity(res)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/actions/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawOnePageCrmNote>(
      '/notes',
      this.listParams(params),
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<{ data?: { note?: RawOnePageCrmNote } }>(`/notes/${id}`)
    const raw = res?.data?.note ?? (res as unknown as RawOnePageCrmNote)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawOnePageCrmNote>('/notes', { note: body })
    return transformNote(res)
  }
}
