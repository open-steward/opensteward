/**
 * Method CRM adapter for the CRM vertical.
 *
 * Maps the Method CRM REST API v1 to canonical CRM resources.
 * Docs: https://developer.method.me/
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 *   Single API key passed in the Authorization header as:
 *     Authorization: APIKey <key>
 *   Generated in Method CRM under Customize → API Keys (requires Admin role).
 *   credentials.accessToken = api key
 *
 * ── API Base URL ─────────────────────────────────────────────────────────────
 *   https://rest.method.me/api/v1
 *
 * ── Coverage ─────────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts    (Contact table)     : list, get, create
 *   Companies   (Customer table)    : list, get, create
 *   Deals       (Opportunity table) : list, get, create
 *   Activities  (Activity table)    : list, get, create
 *   Notes       (Note table)        : list, get, create
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Pipelines — Method CRM does not expose a structured pipeline API endpoint;
 *               stages are lookup values.
 *   Webhooks  — no documented signature scheme.
 *
 * ── Pagination ────────────────────────────────────────────────────────────────
 *   OData $top / $skip (default 25, max 100)
 *   Rate limit: 100 requests/minute per account.
 */

import { simpleApiKey } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { MethodCrmClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawMethodContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawMethodCustomer,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawMethodOpportunity,
} from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawMethodActivity,
} from './transform/activity'
import {
  transformNote,
  untransformNote,
  type RawMethodNote,
} from './transform/note'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText:
    'Generate your API key in Method CRM under Customize → API Keys (Admin role required).',
  placeholder: 'methodcrm_...',
})

export class MethodCrmAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'method-crm'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Method CRM uses API keys, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes the API key as `code`.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire; nothing to refresh.
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

  private client(credentials: Credentials): MethodCrmClient {
    return new MethodCrmClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const page = Number(params['page'] ?? 1)
    const skip = (page - 1) * top
    const resp = await this.client(credentials).listTable<RawMethodContact>(
      'Contact',
      top,
      skip > 0 ? skip : undefined,
    )
    return (resp.value ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).getRecord<RawMethodContact>('Contact', id)
    if (!raw || !raw.RecordId) {
      throw Object.assign(new Error(`Method CRM: contact ${id} not found`), { statusCode: 404 })
    }
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).createRecord<RawMethodContact>('Contact', body)
    if (!raw || !raw.RecordId) {
      throw new Error('Method CRM: contact creation returned no data')
    }
    return transformContact(raw)
  }

  // ── Companies (Customer table) ────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const page = Number(params['page'] ?? 1)
    const skip = (page - 1) * top
    const resp = await this.client(credentials).listTable<RawMethodCustomer>(
      'Customer',
      top,
      skip > 0 ? skip : undefined,
    )
    return (resp.value ?? []).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).getRecord<RawMethodCustomer>('Customer', id)
    if (!raw || !raw.RecordId) {
      throw Object.assign(new Error(`Method CRM: company ${id} not found`), { statusCode: 404 })
    }
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).createRecord<RawMethodCustomer>('Customer', body)
    if (!raw || !raw.RecordId) {
      throw new Error('Method CRM: company creation returned no data')
    }
    return transformCompany(raw)
  }

  // ── Deals (Opportunity table) ─────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const page = Number(params['page'] ?? 1)
    const skip = (page - 1) * top
    const resp = await this.client(credentials).listTable<RawMethodOpportunity>(
      'Opportunity',
      top,
      skip > 0 ? skip : undefined,
    )
    return (resp.value ?? []).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).getRecord<RawMethodOpportunity>('Opportunity', id)
    if (!raw || !raw.RecordId) {
      throw Object.assign(new Error(`Method CRM: deal ${id} not found`), { statusCode: 404 })
    }
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).createRecord<RawMethodOpportunity>(
      'Opportunity',
      body,
    )
    if (!raw || !raw.RecordId) {
      throw new Error('Method CRM: deal creation returned no data')
    }
    return transformDeal(raw)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const page = Number(params['page'] ?? 1)
    const skip = (page - 1) * top
    const resp = await this.client(credentials).listTable<RawMethodActivity>(
      'Activity',
      top,
      skip > 0 ? skip : undefined,
    )
    return (resp.value ?? []).map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).getRecord<RawMethodActivity>('Activity', id)
    if (!raw || !raw.RecordId) {
      throw Object.assign(new Error(`Method CRM: activity ${id} not found`), { statusCode: 404 })
    }
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).createRecord<RawMethodActivity>('Activity', body)
    if (!raw || !raw.RecordId) {
      throw new Error('Method CRM: activity creation returned no data')
    }
    return transformActivity(raw)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const page = Number(params['page'] ?? 1)
    const skip = (page - 1) * top
    const resp = await this.client(credentials).listTable<RawMethodNote>(
      'Note',
      top,
      skip > 0 ? skip : undefined,
    )
    return (resp.value ?? []).map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).getRecord<RawMethodNote>('Note', id)
    if (!raw || !raw.RecordId) {
      throw Object.assign(new Error(`Method CRM: note ${id} not found`), { statusCode: 404 })
    }
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const raw = await this.client(credentials).createRecord<RawMethodNote>('Note', body)
    if (!raw || !raw.RecordId) {
      throw new Error('Method CRM: note creation returned no data')
    }
    return transformNote(raw)
  }
}
