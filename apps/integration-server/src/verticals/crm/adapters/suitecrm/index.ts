/**
 * SuiteCRM adapter for the CRM vertical.
 *
 * Maps the SuiteCRM REST API v8 (JSON:API) to canonical CRM resources.
 * Docs: https://docs.suitecrm.com/developer/api/version-8/
 *
 * Auth: OAuth2 (or API key via Bearer token)
 * Base URL: credentials.extra.instanceUrl ?? 'https://demo.suitecrm.com'
 * API path: /api/v8/
 * Notable:
 *   - Open-source self-hosted CRM
 *   - Contact → Contact, Account → Company, Opportunity → Deal
 *   - JSON:API format with data.attributes
 *   - Activities: Calls + Meetings modules
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts: list, get, create, update, delete
 *   Companies (Accounts): list, get, create, update, delete
 *   Deals (Opportunities): list, get, create, update, delete
 *   Pipelines: list (stub — returns [])
 *   Activities (Calls): list, get, create
 *   Notes: list, get, create
 *   Webhooks: stub
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { SuiteCrmClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawSuiteCrmContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawSuiteCrmAccount } from './transform/company'
import { transformDeal, untransformDeal, type RawSuiteCrmOpportunity } from './transform/deal'
import { transformActivity, untransformActivity, type RawSuiteCrmActivity } from './transform/activity'
import { transformNote, untransformNote, type RawSuiteCrmNote } from './transform/note'

export interface SuiteCrmAdapterConfig {
  instanceUrl?: string
}

export class SuiteCrmAdapter implements CrmAdapter {
  readonly platform = 'suitecrm'
  readonly version = '0.1.0'

  constructor(_config: SuiteCrmAdapterConfig = {}) {}

  // ── Auth (OAuth2) ─────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#oauth2-auth'
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

  private client(credentials: Credentials): SuiteCrmClient {
    return new SuiteCrmClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const pageSize = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    return { pageSize, page }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawSuiteCrmContact>(
      'Contacts',
      this.listParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawSuiteCrmContact>('Contacts', id)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawSuiteCrmContact>('Contacts', body)
    return transformContact(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawSuiteCrmContact>('Contacts', id, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Contacts', id)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawSuiteCrmAccount>(
      'Accounts',
      this.listParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawSuiteCrmAccount>('Accounts', id)
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawSuiteCrmAccount>('Accounts', body)
    return transformCompany(res)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawSuiteCrmAccount>('Accounts', id, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Accounts', id)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawSuiteCrmOpportunity>(
      'Opportunities',
      this.listParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<RawSuiteCrmOpportunity>('Opportunities', id)
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawSuiteCrmOpportunity>('Opportunities', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawSuiteCrmOpportunity>('Opportunities', id, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Opportunities', id)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    // SuiteCRM v8 REST API does not have a native pipeline endpoint
    return []
  }

  // ── Activities (Calls) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawSuiteCrmActivity>(
      'Calls',
      this.listParams(params),
    )
    return items.map(a => transformActivity({ ...a, module_name: 'Calls' }))
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawSuiteCrmActivity>('Calls', id)
    return transformActivity({ ...res, module_name: 'Calls' })
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawSuiteCrmActivity>('Calls', body)
    return transformActivity({ ...res, module_name: 'Calls' })
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawSuiteCrmNote>(
      'Notes',
      this.listParams(params),
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<RawSuiteCrmNote>('Notes', id)
    return transformNote(res)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawSuiteCrmNote>('Notes', body)
    return transformNote(res)
  }
}
