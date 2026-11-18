import { simpleApiKey } from '@opensteward/shared'
/**
 * Solve CRM (Solve360) adapter for the CRM vertical.
 *
 * Maps the Solve360 REST API to canonical CRM resources.
 * Docs: https://solve360.com/api/
 *
 * Auth: HTTP Basic — Authorization: Basic base64(apiToken:emailAddress)
 *   credentials.accessToken  = apiToken
 *   credentials.extra.email  = emailAddress
 *
 * Terminology mapping:
 *   Contacts    → contacts
 *   Companies   → organisations
 *   Deals       → projects
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (19):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete  (Projects)
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

import { SolveCrmClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawSolveContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawSolveOrganisation } from './transform/company'
import { transformDeal, untransformDeal, type RawSolveProject } from './transform/deal'
import { transformActivity, untransformActivity, type RawSolveActivity } from './transform/activity'
import { transformNote, untransformNote, type RawSolveNote } from './transform/note'

// No OAuth — Basic auth is constructed from credentials at runtime
export type SolveCrmAdapterConfig = Record<string, never>
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SolveCrmAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'solve-crm'
  readonly version = '0.1.0'

  // ── Auth stubs (Basic auth adapter) ──────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error('Solve CRM uses HTTP Basic auth, not OAuth2')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Solve CRM uses HTTP Basic auth, not OAuth2')
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

  private client(credentials: Credentials): SolveCrmClient {
    return new SolveCrmClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
      start: (Number(params['page'] ?? 1) - 1) * Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.client(credentials).list<RawSolveContact>('/contacts/', this.listParams(params))
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawSolveContact>(`/contacts/${id}/`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawSolveContact>('/contacts/', body)
    return transformContact(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawSolveContact>(`/contacts/${id}/`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}/`)
  }

  // ── Companies (Organisations) ─────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.client(credentials).list<RawSolveOrganisation>('/organisations/', this.listParams(params))
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawSolveOrganisation>(`/organisations/${id}/`)
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawSolveOrganisation>('/organisations/', body)
    return transformCompany(res)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawSolveOrganisation>(`/organisations/${id}/`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/organisations/${id}/`)
  }

  // ── Deals (Projects) ──────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.client(credentials).list<RawSolveProject>('/projects/', this.listParams(params))
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<RawSolveProject>(`/projects/${id}/`)
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawSolveProject>('/projects/', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawSolveProject>(`/projects/${id}/`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/projects/${id}/`)
  }

  // ── Pipelines (not native in Solve360) ────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    return []
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.client(credentials).list<RawSolveActivity>('/activities/', this.listParams(params))
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawSolveActivity>(`/activities/${id}/`)
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawSolveActivity>('/activities/', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.client(credentials).list<RawSolveNote>('/notes/', this.listParams(params))
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<RawSolveNote>(`/notes/${id}/`)
    return transformNote(res)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawSolveNote>('/notes/', body)
    return transformNote(res)
  }
}
