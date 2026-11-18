import { simpleApiKey } from '@opensteward/shared'
/**
 * Apptivo CRM adapter for the CRM vertical.
 *
 * Maps the Apptivo REST API v2 to canonical CRM resources.
 * Docs: https://apptivo.com/api/
 *
 * Auth: API key (api_secret) + access key (access_key) as query params
 * credentials.accessToken = api_secret
 * credentials.extra.accessKey = access_key
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (24):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete  (Opportunities)
 *   Pipelines:  list
 *   Activities: list, get, create
 *   Notes:      list, get, create
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { ApptivoClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawApptivoContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawApptivoCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawApptivoOpportunity } from './transform/deal'
import { transformPipeline, type RawApptivoPipeline } from './transform/pipeline'
import { transformActivity, untransformActivity, type RawApptivoActivity } from './transform/activity'
import { transformNote, untransformNote, type RawApptivoNote } from './transform/note'

// No OAuth — API keys stored in credentials at runtime
export type ApptivoAdapterConfig = Record<string, never>
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ApptivoAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'apptivo'
  readonly version = '0.1.0'

  // ── Auth stubs (API-key adapter) ──────────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error('Apptivo uses API key auth, not OAuth2')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Apptivo uses API key auth, not OAuth2')
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

  private client(credentials: Credentials): ApptivoClient {
    return new ApptivoClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      num_rows: Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
      start_index: (Number(params['page'] ?? 1) - 1) * Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.client(credentials).list<RawApptivoContact>('/customer', {
      ...this.listParams(params),
      type: 'person', // TODO: verify contact type discriminator against Apptivo API docs
    })
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawApptivoContact>(`/customer/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawApptivoContact>('/customer', body)
    return transformContact(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawApptivoContact>(`/customer/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/customer/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.client(credentials).list<RawApptivoCompany>('/customer', {
      ...this.listParams(params),
      type: 'company',
    })
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawApptivoCompany>(`/customer/${id}`)
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawApptivoCompany>('/customer', body)
    return transformCompany(res)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawApptivoCompany>(`/customer/${id}`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/customer/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.client(credentials).list<RawApptivoOpportunity>('/opportunity', this.listParams(params))
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<RawApptivoOpportunity>(`/opportunity/${id}`)
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawApptivoOpportunity>('/opportunity', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawApptivoOpportunity>(`/opportunity/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunity/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const items = await this.client(credentials).list<RawApptivoPipeline>(
      '/opportunity/pipeline',
      this.listParams(params),
    )
    return items.map(transformPipeline)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.client(credentials).list<RawApptivoActivity>('/activity', this.listParams(params))
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawApptivoActivity>(`/activity/${id}`)
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawApptivoActivity>('/activity', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.client(credentials).list<RawApptivoNote>('/note', this.listParams(params))
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<RawApptivoNote>(`/note/${id}`)
    return transformNote(res)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawApptivoNote>('/note', body)
    return transformNote(res)
  }
}
