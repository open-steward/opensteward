import { simpleApiKey } from '@opensteward/shared'
/**
 * CorporateStack adapter for the CRM vertical.
 *
 * Maps the CorporateStack REST API to canonical CRM resources.
 * Website: https://corporatestack.com
 *
 * Auth: API key via Authorization Bearer header
 * Base URL: https://api.corporatestack.com
 * Notable:
 *   - UAE/GCC-focused enterprise CRM
 *   - Limited public API documentation — endpoints are best-guess estimates
 *   - All TODO comments indicate unverified endpoint paths
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * CorporateStack's only first-party API text is the "Website Form Integration
 * with CorporateStack CRM" guide,
 * https://corporatestack.com/website-form-integration-with-corporatestack-crm/:
 * "API details provided by CorporateStack: API URL (Endpoint) Authorization
 * Header (API Key / Token)", "Method: POST", with the lead fields firstName,
 * email, mobile and remarks. It documents no list or read-by-id endpoint for
 * any resource, and the site's sitemap has no developer or API reference page.
 *
 * Refused with 501 NOT_SUPPORTED before any request:
 *   Contacts, Companies, Deals, Activities, Notes: list, get
 *   Pipelines: list
 *
 * Unchanged and unverified (write methods, out of scope of the read rebuild):
 *   Contacts: create, update, delete; Companies: create, update, delete;
 *   Deals: create, update, delete; Activities: create; Notes: create.
 *   Their paths (/contacts, /companies, /deals, /activities, /notes) are not
 *   in any vendor doc.
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

import { CorporateStackClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawCorporateStackContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawCorporateStackCompany,
} from './transform/company'
import { transformDeal, untransformDeal, type RawCorporateStackDeal } from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawCorporateStackActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawCorporateStackNote } from './transform/note'

export interface CorporateStackAdapterConfig {
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

const NO_READ_API =
  'the only CorporateStack API text, the "Website Form Integration with CorporateStack CRM" guide, documents a single "Method: POST" that creates a lead at a customer-issued "API URL (Endpoint)", and no endpoint that lists or reads records'

function notSupported(verb: 'list' | 'read', resource: string): Error {
  return Object.assign(new Error(`CorporateStack cannot ${verb} ${resource}: ${NO_READ_API}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export class CorporateStackAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'corporatestack'
  readonly version = '0.1.0'

  constructor(_config: CorporateStackAdapterConfig = {}) {}

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

  private client(credentials: Credentials): CorporateStackClient {
    return new CorporateStackClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(_credentials: Credentials, _params: QueryParams): Promise<Contact[]> {
    throw notSupported('list', 'contacts')
  }

  async getContact(_credentials: Credentials, _id: string): Promise<Contact> {
    throw notSupported('read', 'contacts')
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).post<RawCorporateStackContact>('/contacts', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).put<RawCorporateStackContact>(
      `/contacts/${id}`,
      body,
    )
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    // TODO: verify endpoint path
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(_credentials: Credentials, _params: QueryParams): Promise<Company[]> {
    throw notSupported('list', 'companies')
  }

  async getCompany(_credentials: Credentials, _id: string): Promise<Company> {
    throw notSupported('read', 'companies')
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).post<RawCorporateStackCompany>('/companies', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).put<RawCorporateStackCompany>(
      `/companies/${id}`,
      body,
    )
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    // TODO: verify endpoint path
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    throw notSupported('list', 'deals')
  }

  async getDeal(_credentials: Credentials, _id: string): Promise<Deal> {
    throw notSupported('read', 'deals')
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).post<RawCorporateStackDeal>('/deals', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).put<RawCorporateStackDeal>(`/deals/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    // TODO: verify endpoint path
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw notSupported('list', 'pipelines')
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(_credentials: Credentials, _params: QueryParams): Promise<Activity[]> {
    throw notSupported('list', 'activities')
  }

  async getActivity(_credentials: Credentials, _id: string): Promise<Activity> {
    throw notSupported('read', 'activities')
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).post<RawCorporateStackActivity>('/activities', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notSupported('list', 'notes')
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw notSupported('read', 'notes')
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).post<RawCorporateStackNote>('/notes', body)
    return transformNote(res)
  }
}
