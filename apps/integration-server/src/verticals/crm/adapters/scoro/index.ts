import { customForm, reportUpstreamPage, type CredentialField } from '@opensteward/shared'
/**
 * Scoro adapter for the CRM vertical.
 *
 * Docs: https://api.scoro.com/api/v2 (first-party reference; every quote in
 * this adapter is from it).
 *
 * Host: "https://#companyname#.scoro.com/api/v2/#module#(/#action#)(/#id#)",
 * "where #companyname# is the subdomain". Auth: apiKey and company_account_id
 * in every JSON body ("All requests should contain at least the following
 * values"). "All API requests are composed of light-weight JSON delivered as an
 * HTTP POST request to the endpoint URL."
 *
 * Resources:
 *   Contacts   contacts/list + contacts/view, contact_type "person"
 *   Companies  contacts/list + contacts/view, contact_type "company" — Scoro
 *              has no companies module
 *   Deals      quotes/list + quotes/view
 *   Activities tasks/list + tasks/view
 *   Pipelines  refused: no pipelines module
 *   Notes      list and get refused: comments/list needs a parent
 *              ("module" and "object_id" are mandatory) and comments has no
 *              view action
 *
 * Paging: "per_page" and 1-based "page" in the list body; "A maximum of 100
 * results will be returned for list methods, regardless of the value sent with
 * the per_page parameter." No total or has-more field is documented.
 *
 * Writes are unchanged from before the read rebuild: they still post to
 * "<module>/add" and send fields at the top level of the body, neither of which
 * the reference documents (it documents "<module>/modify/(#id)" with a
 * "request" object).
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { ScoroClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawScoroContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawScoroCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawScoroDeal } from './transform/deal'
import { transformActivity, untransformActivity, type RawScoroActivity } from './transform/activity'
import { transformNote, untransformNote, type RawScoroNote } from './transform/note'

export interface ScoroAdapterConfig {
  apiKey?: string
}

const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

/**
 * "The apiKey and company_account_id values are listed in Settings > External
 * Connections > API." The subdomain is the host: "#companyname# is the
 * subdomain".
 */
const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'subdomain',
    label: 'Scoro subdomain',
    type: 'text',
    placeholder: 'mycompany',
    helpText: 'The "mycompany" part of your Scoro address, mycompany.scoro.com.',
    required: true,
  },
  {
    name: 'companyAccountId',
    label: 'Company account ID',
    type: 'text',
    helpText: 'company_account_id, listed in Scoro under Settings > External Connections > API.',
    required: true,
  },
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    helpText: 'apiKey, listed in Scoro under Settings > External Connections > API.',
    required: true,
  },
]

const CREDENTIAL_FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const subdomain = (fields['subdomain'] ?? '').trim().toLowerCase()
    const companyAccountId = (fields['companyAccountId'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!SUBDOMAIN.test(subdomain)) {
      throw new Error('Scoro subdomain is required: the "mycompany" in mycompany.scoro.com.')
    }
    if (!companyAccountId) throw new Error('Company account ID is required.')
    if (!apiKey) throw new Error('API key is required.')
    return { accessToken: apiKey, extra: { subdomain, companyAccountId } }
  },
})

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 })
}

export class ScoroAdapter implements CrmAdapter {
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — subdomain + company_account_id + apiKey.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'scoro'
  readonly version = '0.1.0'

  constructor(_config: ScoroAdapterConfig = {}) {}

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

  private client(credentials: Credentials): ScoroClient {
    return new ScoroClient(credentials)
  }

  /**
   * The caller's 1-based page and its limit, clamped to the documented 100.
   * A size below the caller's limit is reported, so a full page of 100 is not
   * read as the last one.
   */
  private page(params: QueryParams): { page: number; perPage: number } {
    const p = Number(params.page)
    const l = Number(params.limit)
    const page = Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1
    const asked = Number.isFinite(l) && l >= 1 ? Math.floor(l) : DEFAULT_PAGE_SIZE
    const perPage = Math.min(asked, MAX_PAGE_SIZE)
    if (perPage < asked) reportUpstreamPage(params, { pageSize: perPage })
    return { page, perPage }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  /**
   * contacts/list filtered to contact_type "person". "List results can be
   * filtered by adding a filter object to the request. This filter object
   * should have field names as keys and search words as values."
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.client(credentials).list<RawScoroContact>('contacts', {
      ...this.page(params),
      filter: { contact_type: 'person' },
    })
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).view<RawScoroContact>('contacts', id)
    if (raw.contact_type !== 'person') throw notFound(`Scoro contact ${id} is not a person`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawScoroContact>('contacts', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawScoroContact>('contacts', id, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('contacts', id)
  }

  // ── Companies (contacts of contact_type "company") ────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const rows = await this.client(credentials).list<RawScoroCompany>('contacts', {
      ...this.page(params),
      filter: { contact_type: 'company' },
    })
    return rows.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).view<RawScoroCompany>('contacts', id)
    if (raw.contact_type !== 'company') throw notFound(`Scoro contact ${id} is not a company`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawScoroCompany>('companies', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawScoroCompany>('companies', id, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('companies', id)
  }

  // ── Deals (Quotes) ────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const rows = await this.client(credentials).list<RawScoroDeal>('quotes', this.page(params))
    return rows.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    return transformDeal(await this.client(credentials).view<RawScoroDeal>('quotes', id))
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawScoroDeal>('quotes', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawScoroDeal>('quotes', id, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('quotes', id)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw notSupported(
      'Scoro cannot list pipelines: its API v2 reference has no pipelines module ' +
        '(every endpoint is "https://#companyname#.scoro.com/api/v2/#module#(/#action#)(/#id#)", and no module is pipelines)',
    )
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  /**
   * tasks/list with subtasks included. Without it the walk ends while subtasks
   * are still missing: "Use 'include_subtasks = 1' in request object to get
   * subtask objects to response as well. By default, subtasks are not
   * included." The same reference's tasks/list example puts it at the top
   * level instead: "Get list of tasks with \"include_subtasks\" parameter (by
   * default not included) Example request body: { ..., \"request\": {},
   * \"include_subtasks\": 1 }". The two placements disagree, so it is sent in
   * both.
   */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const rows = await this.client(credentials).list<RawScoroActivity>('tasks', {
      ...this.page(params),
      request: { include_subtasks: 1 },
      params: { include_subtasks: 1 },
    })
    return rows.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    return transformActivity(await this.client(credentials).view<RawScoroActivity>('tasks', id))
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawScoroActivity>('tasks', body)
    return transformActivity(res)
  }

  // ── Notes (Comments) ──────────────────────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notSupported(
      'Scoro cannot list notes: comments/list says \'Fields "module" and "object_id" are mandatory\', ' +
        'so comments can only be listed under one parent record',
    )
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw notSupported(
      'Scoro cannot read a note by id: the Comments module documents only the list, modify and delete actions',
    )
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawScoroNote>('comments', body)
    return transformNote(res)
  }
}
