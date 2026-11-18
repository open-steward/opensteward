import { pageLocally, simpleApiKey } from '@opensteward/shared'
/**
 * Holded CRM adapter for the CRM vertical.
 *
 * Maps the Holded CRM API v1 to canonical CRM resources.
 * Docs: https://developers.holded.com/reference/crm-overview
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (14):
 *   Contacts:  list, get, create, update, delete
 *   Companies: list, get, create, update, delete
 *   Deals:     list, get, create, update, delete
 *   Pipelines: list
 *   Notes:     list, create
 *
 * Omitted — not available in Holded CRM API:
 *   Activities (all)
 *   Notes get/update/delete
 *   Pipelines get
 *
 * Auth: API key sent as `key: <apiKey>` header
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { HoldedClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawHoldedContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawHoldedCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawHoldedDeal } from './transform/deal'
import { transformPipeline, type RawHoldedPipeline } from './transform/pipeline'
import { transformNote, untransformNote, type RawHoldedNote } from './transform/note'

export interface HoldedAdapterConfig {
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class HoldedAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'holded'
  readonly version = '0.1.0'

  private apiKey: string | undefined

  constructor(config: HoldedAdapterConfig = {}) {
    this.apiKey = config.apiKey
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.apiKey) throw new Error('Holded: apiKey required')
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

  private c(creds: Credentials): HoldedClient {
    return new HoldedClient(this.apiKey ? { accessToken: this.apiKey } : creds)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params['limit'] ?? DEFAULT_PAGE_SIZE,
      page: params['page'] ?? 1,
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.c(credentials).list<RawHoldedContact>(
      '/contacts',
      { ...this.listParams(params), type: 'contact' },
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.c(credentials).get<RawHoldedContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.c(credentials).post<RawHoldedContact>('/contacts', untransformContact(data))
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.c(credentials).put<RawHoldedContact>(`/contacts/${id}`, untransformContact(data))
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.c(credentials).list<RawHoldedCompany>(
      '/contacts',
      { ...this.listParams(params), type: 'company' },
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.c(credentials).get<RawHoldedCompany>(`/contacts/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.c(credentials).post<RawHoldedCompany>('/contacts', untransformCompany(data))
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const raw = await this.c(credentials).put<RawHoldedCompany>(`/contacts/${id}`, untransformCompany(data))
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/contacts/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.c(credentials).list<RawHoldedDeal>('/leads', this.listParams(params))
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.c(credentials).get<RawHoldedDeal>(`/leads/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).post<RawHoldedDeal>('/leads', untransformDeal(data))
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).put<RawHoldedDeal>(`/leads/${id}`, untransformDeal(data))
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/leads/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  // GET /funnels is unpaginated ("Get all your funnels.", no parameters, bare
  // array): fetch every funnel once, with no paging params, and page locally.
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const res = await this.c(credentials).get<RawHoldedPipeline[]>('/funnels')
    return pageLocally(Array.isArray(res) ? res : [], params).map(transformPipeline)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.c(credentials).list<RawHoldedNote>('/notes', this.listParams(params))
    return items.map(transformNote)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).post<RawHoldedNote>('/notes', untransformNote(data))
    return transformNote(raw)
  }
}
