import { customForm, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CredentialField } from '@opensteward/shared'
/**
 * Teamwork CRM adapter for the CRM vertical.
 *
 * Maps the Teamwork CRM REST API v2 to canonical CRM resources.
 *
 * Docs: the vendor's own reference at developer.teamwork.com/crm, which now
 * redirects to an apidocs.teamwork.com page with no CRM content. Every path,
 * parameter and field below comes from Wayback snapshots of that first-party
 * site (2019-11 and 2020-08), cited per method.
 *
 * Auth: `Authorization: Bearer {API key}`
 * Base URL: `{site URL}/crm/api/v2`, per customer (see client.ts).
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Reads (API v2, documented):
 *   Contacts, Companies, Deals, Activities: list, get
 *   Pipelines: list
 *   Notes: list, get
 * Writes (unchanged, still on undocumented paths):
 *   Contacts, Companies, Deals: create, update, delete
 *   Activities, Notes: create
 * Webhooks: stub
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { TeamworkCrmClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawTeamworkContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawTeamworkCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawTeamworkDeal } from './transform/deal'
import {
  transformPipeline,
  type RawTeamworkPipeline,
  type RawTeamworkStage,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawTeamworkActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawTeamworkNote } from './transform/note'

export interface TeamworkCrmAdapterConfig {
  apiKey?: string
}

/**
 * "First things first, you will need your API key and your site URL to start
 * using the API." ... "Copy the URL from your address bar (ignoring
 * `/crm...`). This should be something like `https://example.teamwork.com`.
 * If you're using a custom domain, it might be something like
 * `https://projects.example.com`." ... "In Teamwork CRM, click your avatar in
 * the top right. Click "Settings". Go to "Personal". At the bottom of this
 * screen, generate an API key."
 * (https://web.archive.org/web/20191122005536id_/https://developer.teamwork.com/crm/intro/getting-started)
 */
const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'siteUrl',
    label: 'Site URL',
    type: 'url',
    placeholder: 'https://example.teamwork.com',
    helpText:
      'The address of your Teamwork site, without /crm (e.g. https://example.teamwork.com or your custom domain).',
    required: true,
  },
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    helpText: 'In Teamwork CRM: your avatar → Settings → Personal → generate an API key.',
    required: true,
  },
]

const CREDENTIAL_FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  async exchange(input) {
    const apiKey = (input?.['apiKey'] ?? '').trim()
    const siteUrl = (input?.['siteUrl'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    if (!siteUrl) throw new Error('Site URL is required.')
    let origin: string
    try {
      const url = new URL(siteUrl)
      if (url.protocol !== 'https:') throw new Error('not https')
      origin = url.origin
    } catch {
      throw new Error('Site URL must be an https:// address such as https://example.teamwork.com.')
    }
    return { accessToken: apiKey, extra: { siteUrl: origin } }
  },
})

/**
 * Sent on every list. Offset paging is only stable under a fixed order, and
 * the defaults differ per endpoint (contacts and companies by name, deals and
 * activities "with the most recently created first", so a new row shifts every
 * later offset). `createdAt` is in the documented sort values of all six
 * lists, and `orderMode` is `{"enum":["asc","desc"]}`: oldest first appends
 * new rows at the end.
 */
const CREATED_ASC = { orderBy: 'createdAt', orderMode: 'asc' } as const

export class TeamworkCrmAdapter implements CrmAdapter {
  // Connect Link support — site URL and API key.

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  readonly platform = 'teamwork-crm'
  readonly version = '0.2.0'

  constructor(_config: TeamworkCrmAdapterConfig = {}) {}

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

  private client(credentials: Credentials): TeamworkCrmClient {
    return new TeamworkCrmClient(credentials)
  }

  /**
   * One caller page of a v2 list. From "Pagination"
   * (https://web.archive.org/web/20191121231823id_/https://developer.teamwork.com/crm/general/pagination):
   * "`count` is the total number of entities." ... "`pageSize` is the max
   * number of items per page. This can be changed by passing the `pageSize`
   * query parameter" ... "`pageOffset` is where the page starts from, i.e.
   * the index position of the first item to return from the overall result
   * set. This is 0 by default."
   *
   * `updatedAfter` becomes `filter[updatedAt][gte]`: `updatedAt` is a
   * documented filter target of every list served here, and "Filtering"
   * (https://web.archive.org/web/20200810124444id_/https://developer.teamwork.com/crm/general/filtering)
   * documents `filter[$target][$operator]=$value`, and its operator table
   * has the row "| gte | 1 |  Value is greater than or equal to |".
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    key: string,
    params: QueryParams,
    extra: Record<string, string> = {},
  ): Promise<{ rows: T[]; included: Record<string, unknown> }> {
    const asked =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const size = Math.min(asked, MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const updatedAfter =
      params.updatedAfter instanceof Date && !Number.isNaN(params.updatedAfter.getTime())
        ? { 'filter[updatedAt][gte]': params.updatedAfter.toISOString().replace(/\.\d{3}Z$/, 'Z') }
        : {}
    const { rows, count, included } = await this.client(credentials).listPage<T>(path, key, {
      pageSize: size,
      pageOffset: offset,
      ...CREATED_ASC,
      ...updatedAfter,
      ...extra,
    })
    reportUpstreamPage(params, {
      ...(count !== undefined ? { totalCount: count, hasMore: offset + rows.length < count } : {}),
      ...(size < asked ? { pageSize: size } : {}),
    })
    return { rows, included }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  /** GET /contacts.json → `contacts[]` (…/api-reference/contacts/get-contactsjson). */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { rows } = await this.listPage<RawTeamworkContact>(
      credentials,
      '/contacts.json',
      'contacts',
      params,
    )
    return rows.map(transformContact)
  }

  /** GET /contacts/{id}.json → `contact` (…/api-reference/contacts/get-contacts-idjson). */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).getOne<RawTeamworkContact>(
      `/contacts/${encodeURIComponent(id)}.json`,
      'contact',
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawTeamworkContact>('/contacts', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawTeamworkContact>(`/contacts/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  /** GET /companies.json → `companies[]` (…/api-reference/companies/get-companiesjson). */
  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { rows } = await this.listPage<RawTeamworkCompany>(
      credentials,
      '/companies.json',
      'companies',
      params,
    )
    return rows.map(transformCompany)
  }

  /** GET /companies/{id}.json → `company` (…/api-reference/companies/get-companies-idjson). */
  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).getOne<RawTeamworkCompany>(
      `/companies/${encodeURIComponent(id)}.json`,
      'company',
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawTeamworkCompany>('/companies', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawTeamworkCompany>(`/companies/${id}`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  /** GET /deals.json → `deals[]` (…/api-reference/deals/get-dealsjson). */
  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { rows } = await this.listPage<RawTeamworkDeal>(
      credentials,
      '/deals.json',
      'deals',
      params,
    )
    return rows.map(transformDeal)
  }

  /** GET /deals/{id}.json → `deal` (…/api-reference/deals/get-deals-idjson). */
  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).getOne<RawTeamworkDeal>(
      `/deals/${encodeURIComponent(id)}.json`,
      'deal',
    )
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawTeamworkDeal>('/deals', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawTeamworkDeal>(`/deals/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * GET /pipelines.json → `pipelines[]`, with `include=stages` (the one
   * documented include value) side-loading `included.stages`
   * (https://web.archive.org/web/20200810124444id_/https://developer.teamwork.com/crm/api-reference/pipelines/get-pipelinesjson).
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const { rows, included } = await this.listPage<RawTeamworkPipeline>(
      credentials,
      '/pipelines.json',
      'pipelines',
      params,
      { include: 'stages' },
    )
    const stages = Array.isArray(included['stages'])
      ? (included['stages'] as RawTeamworkStage[])
      : []
    return rows.map((row) => transformPipeline(row, stages))
  }

  // ── Activities ────────────────────────────────────────────────────────────

  /** GET /activities.json → `activities[]` (…/api-reference/activities/get-activitiesjson). */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { rows } = await this.listPage<RawTeamworkActivity>(
      credentials,
      '/activities.json',
      'activities',
      params,
    )
    return rows.map(transformActivity)
  }

  /** GET /activities/{id}.json → `activity` (…/api-reference/activities/get-activities-idjson). */
  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).getOne<RawTeamworkActivity>(
      `/activities/${encodeURIComponent(id)}.json`,
      'activity',
    )
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawTeamworkActivity>('/activities', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  /**
   * GET /notes.json: "Lists all the notes, they are returned with the oldest
   * first by default.", sort values "createdAt (default)" and "updatedAt",
   * filter target updatedAt
   * (https://web.archive.org/web/20200810124444id_/https://developer.teamwork.com/crm/api-reference/notes/get-notesjson).
   * That page's 200 schema is a copy of the single-note `noteResponse`; the
   * list key comes from "Response structure": "The entity type will be in its
   * singular form when using a single entity endpoint but plural when dealing
   * with a list endpoint (e.g. `deals`)."
   * (https://web.archive.org/web/20191122000235id_/https://developer.teamwork.com/crm/general/response-structure),
   * so the rows are `notes[]`, and Pagination: "List endpoints typically limit
   * the number of entities returned. ... There is a `meta` root property in
   * the response, containing pagination metadata".
   */
  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { rows } = await this.listPage<RawTeamworkNote>(
      credentials,
      '/notes.json',
      'notes',
      params,
    )
    return rows.map(transformNote)
  }

  /** GET /notes/{id}.json → `note` (…/api-reference/notes/get-notes-idjson). */
  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).getOne<RawTeamworkNote>(
      `/notes/${encodeURIComponent(id)}.json`,
      'note',
    )
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawTeamworkNote>('/notes', body)
    return transformNote(res)
  }
}
