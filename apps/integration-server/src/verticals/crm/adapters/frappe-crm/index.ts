/**
 * Frappe CRM adapter for the CRM vertical.
 *
 * Maps the Frappe CRM REST API (Frappe Framework /api/resource/) to
 * canonical CRM resources. Frappe CRM is self-hosted; users supply
 * their instance URL, API key, and API secret.
 *
 * Docs: https://docs.frappe.io/framework/user/en/api/rest
 *       https://docs.frappe.io/framework/user/en/guides/integration/rest_api/token_based_authentication
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 *   Token-based: `Authorization: token <api_key>:<api_secret>`
 *   credentials.accessToken   = api_key
 *   credentials.refreshToken  = api_secret
 *   credentials.extra.instanceUrl = e.g. "https://crm.example.com"
 *
 * ── Doctypes ─────────────────────────────────────────────────────────────────
 *   Contacts  → CRM Lead
 *   Companies → CRM Organization
 *   Deals     → CRM Deal
 *   Notes     → FCRM Note
 *   Activities→ CRM Task
 *   Pipelines — no pipeline/stage doctype exists in Frappe CRM (unavailable)
 *
 * ── Coverage ─────────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts  : list, get, create, update, delete
 *   Companies : list, get, create, update, delete
 *   Deals     : list, get, create, update, delete
 *   Notes     : list, get, create, update, delete
 *   Activities: list, get, create, update, delete
 *
 * Omitted (auto-501):
 *   Pipelines — no pipeline/stage doctype exists; deal progression uses a
 *               status field only. Confirmed via frappe/crm doctype directory.
 *   Webhooks  — Frappe Framework webhooks have no documented HMAC signature
 *
 * ── Resource coverage ────────────────────────────────────────────────────────
 * Unavailable: pipeline — Frappe CRM has no pipeline or stage doctype; deal
 *              progression is tracked via CRM Deal Status field with no
 *              REST-queryable pipeline entity.
 */

import { customForm } from '@opensteward/shared'
import type { CredentialField } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { FrappeCrmClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  LEAD_FIELDS,
  DEAL_FIELDS,
  NOTE_FIELDS,
  TASK_FIELDS,
  ORGANIZATION_FIELDS,
} from './constants'
import {
  transformContact,
  untransformContact,
  type RawFrappeLead,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawFrappeOrganization,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawFrappeDeal,
} from './transform/deal'
import {
  transformNote,
  untransformNote,
  type RawFrappeNote,
} from './transform/note'
import {
  transformActivity,
  untransformActivity,
  type RawFrappeTask,
} from './transform/activity'

// ── Credential form ───────────────────────────────────────────────────────────
// Frappe CRM is self-hosted so we collect instanceUrl + api_key + api_secret.

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'instanceUrl',
    label: 'Instance URL',
    type: 'text',
    placeholder: 'https://crm.example.com',
    helpText: 'Base URL of your Frappe CRM installation (no trailing slash).',
    required: true,
  },
  {
    name: 'apiKey',
    label: 'API Key',
    type: 'password',
    helpText: 'Found under User > Settings > API Access > Generate Keys.',
    required: true,
  },
  {
    name: 'apiSecret',
    label: 'API Secret',
    type: 'password',
    helpText: 'Shown once when you generate the API keys.',
    required: true,
  },
]

const CREDENTIAL_FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const instanceUrl = (input['instanceUrl'] ?? '').trim().replace(/\/$/, '')
    const apiKey = (input['apiKey'] ?? '').trim()
    const apiSecret = (input['apiSecret'] ?? '').trim()
    if (!instanceUrl) throw new Error('Instance URL is required.')
    if (!apiKey) throw new Error('API Key is required.')
    if (!apiSecret) throw new Error('API Secret is required.')
    return {
      accessToken: apiKey,
      refreshToken: apiSecret,
      extra: { instanceUrl },
    }
  },
})

// ── Adapter ───────────────────────────────────────────────────────────────────

export class FrappeCrmAdapter implements CrmAdapter {
  readonly platform = 'frappe-crm'
  readonly version = '0.1.0'

  // Connect Link credential form
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Frappe CRM uses API key/secret, not OAuth2.
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Not used — credentials are collected via the custom form.
    throw new Error('FrappeCRM: use credentialFields/exchangeCredentials instead of exchangeCode')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API key + secret do not expire.
    return credentials
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): FrappeCrmClient {
    return new FrappeCrmClient(credentials)
  }

  private pageParams(params: QueryParams): { limit: number; offset: number } {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = Number(params['page'] ?? 1)
    const offset = (page - 1) * limit
    return { limit, offset }
  }

  // ── Contacts (CRM Lead) ──────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { limit, offset } = this.pageParams(params)
    const raws = await this.client(credentials).list<RawFrappeLead>('CRM Lead', {
      fields: LEAD_FIELDS,
      limit,
      offset,
      orderBy: 'creation desc',
    })
    return raws.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawFrappeLead>('CRM Lead', id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawFrappeLead>('CRM Lead', body)
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).put<RawFrappeLead>('CRM Lead', id, body)
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('CRM Lead', id)
  }

  // ── Companies (CRM Organization) ─────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { limit, offset } = this.pageParams(params)
    const raws = await this.client(credentials).list<RawFrappeOrganization>('CRM Organization', {
      fields: ORGANIZATION_FIELDS,
      limit,
      offset,
      orderBy: 'creation desc',
    })
    return raws.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawFrappeOrganization>('CRM Organization', id)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawFrappeOrganization>('CRM Organization', body)
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).put<RawFrappeOrganization>('CRM Organization', id, body)
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('CRM Organization', id)
  }

  // ── Deals (CRM Deal) ─────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { limit, offset } = this.pageParams(params)
    const raws = await this.client(credentials).list<RawFrappeDeal>('CRM Deal', {
      fields: DEAL_FIELDS,
      limit,
      offset,
      orderBy: 'creation desc',
    })
    return raws.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawFrappeDeal>('CRM Deal', id)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).post<RawFrappeDeal>('CRM Deal', body)
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).put<RawFrappeDeal>('CRM Deal', id, body)
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('CRM Deal', id)
  }

  // ── Notes (FCRM Note) ────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { limit, offset } = this.pageParams(params)
    const raws = await this.client(credentials).list<RawFrappeNote>('FCRM Note', {
      fields: NOTE_FIELDS,
      limit,
      offset,
      orderBy: 'creation desc',
    })
    return raws.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawFrappeNote>('FCRM Note', id)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const raw = await this.client(credentials).post<RawFrappeNote>('FCRM Note', body)
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const raw = await this.client(credentials).put<RawFrappeNote>('FCRM Note', id, body)
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('FCRM Note', id)
  }

  // ── Activities (CRM Task) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { limit, offset } = this.pageParams(params)
    const raws = await this.client(credentials).list<RawFrappeTask>('CRM Task', {
      fields: TASK_FIELDS,
      limit,
      offset,
      orderBy: 'creation desc',
    })
    return raws.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawFrappeTask>('CRM Task', id)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).post<RawFrappeTask>('CRM Task', body)
    return transformActivity(raw)
  }

  async updateActivity(credentials: Credentials, id: string, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).put<RawFrappeTask>('CRM Task', id, body)
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('CRM Task', id)
  }
}
