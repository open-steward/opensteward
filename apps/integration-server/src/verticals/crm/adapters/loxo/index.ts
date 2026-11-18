/**
 * Loxo adapter for the CRM vertical.
 *
 * Maps the Loxo REST API to canonical CRM resources.
 * Docs: https://loxo.readme.io/reference/loxo-api
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 *   Bearer token passed as: Authorization: Bearer <api_key>
 *   credentials.accessToken  = API key (from Settings > API Keys in Loxo)
 *   credentials.extra.agencySlug = Loxo agency slug (from careers page URL)
 *   credentials.extra.domain = optional custom domain (defaults to app.loxo.co)
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *
 * Implemented (17):
 *   Contacts (people): list, get, create, update
 *   Companies: list, get, create
 *   Deals: list, get, create, update
 *   Pipelines (deal_workflows): list, get
 *   Activities (person_events): list, get, create
 *   Notes (person_events): list, get, create
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   deleteContact, deleteCompany, deleteDeal (not supported by Loxo open API)
 *   deleteActivity, deleteNote
 *   updateCompany (not documented in open API)
 */
import {
  connectionScope,
  cursorPagerKey,
  customForm,
  pageByCursor,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CredentialField } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { LoxoClient, type LoxoListResponse } from './client'
import { DEFAULT_PAGE_SIZE, LOXO_DEFAULT_DOMAIN } from './constants'
import {
  transformContact,
  untransformContact,
  type RawLoxoPerson,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawLoxoCompany,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawLoxoDeal,
} from './transform/deal'
import {
  transformPipeline,
  type RawLoxoPipeline,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawLoxoActivity,
} from './transform/activity'
import {
  transformNote,
  untransformNote,
  type RawLoxoNote,
} from './transform/note'
import { verifyWebhook as loxoVerifyWebhook, parseWebhookEvents as loxoParseWebhookEvents } from './webhook'
import type { WebhookEvent } from '../../schema/webhook'

// ── Credential form ─────────────────────────────────────────────────────────

const LOXO_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API Key',
    type: 'password',
    required: true,
    helpText: 'Generate in Loxo → Settings → API Keys (admin access required).',
  },
  {
    name: 'agencySlug',
    label: 'Agency Slug',
    type: 'text',
    required: true,
    helpText: 'The identifier in your Loxo careers page URL, e.g. "acme-search".',
  },
  {
    name: 'domain',
    label: 'Custom Domain (optional)',
    type: 'text',
    required: false,
    placeholder: 'app.loxo.co',
    helpText: 'Leave blank unless you are on a self-hosted Loxo instance.',
  },
]

const LOXO_FORM = customForm({
  fields: LOXO_CREDENTIAL_FIELDS,
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const agencySlug = (fields['agencySlug'] ?? '').trim()
    if (!apiKey) throw new Error('API Key is required.')
    if (!agencySlug) throw new Error('Agency Slug is required.')
    const extra: Record<string, string> = { agencySlug }
    const domain = (fields['domain'] ?? '').trim()
    if (domain) extra['domain'] = domain
    return { accessToken: apiKey, extra }
  },
})

export class LoxoAdapter implements CrmAdapter {
  readonly platform = 'loxo'
  readonly version = '0.1.0'

  // ── Connect Link support ───────────────────────────────────────────────────

  credentialFields = LOXO_FORM.credentialFields

  exchangeCredentials = LOXO_FORM.exchangeCredentials

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Loxo uses API key auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Not used for API key auth — callers may pass apiKey as code.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire; no refresh needed.
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return loxoVerifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return loxoParseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): LoxoClient {
    return new LoxoClient(credentials)
  }

  private pageSize(params: QueryParams): number {
    return params.limit ?? DEFAULT_PAGE_SIZE
  }

  /** Pager scope for one connection: the agency it reaches, plus its token. */
  private scope(credentials: Credentials): string {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    const account = `${extra['domain'] ?? LOXO_DEFAULT_DOMAIN}/${extra['agencySlug'] ?? ''}`
    return connectionScope(account, credentials)
  }

  /**
   * One caller page of a scroll_id collection that honours `per_page`
   * (people, companies). One upstream page is one caller page.
   *
   * The docs say scroll_id is "Returned in each response" and never say how
   * the chain ends, so a short or empty page ends it, not only an absent
   * scroll_id. A caller that passes its own `scroll_id` is at a position, not
   * a page, and gets that one upstream page.
   */
  private async listScroll<R>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    filters: Record<string, unknown>,
  ): Promise<R[]> {
    const client = this.client(credentials)
    const limit = this.pageSize(params)
    const fetchPage = async (cursor: string | undefined) => {
      const { items, scrollId } = await client.listCursor<R>(path, {
        ...filters,
        per_page: limit,
        scroll_id: cursor,
      })
      return { items, next: items.length < limit ? undefined : scrollId }
    }
    if (params['scroll_id']) {
      const res = await fetchPage(String(params['scroll_id']))
      reportUpstreamPage(params, { hasMore: res.next !== undefined })
      return res.items
    }
    const key = cursorPagerKey(this.scope(credentials), path, { ...filters, limit })
    const { items, hasMore } = await pageByCursor(key, params.page, fetchPage)
    reportUpstreamPage(params, { hasMore })
    return items
  }

  /**
   * One caller page of a person_events page, which documents `page`
   * ("Page number to return. Starting at 1") and `per_page`.
   */
  private async listPersonEvents<R>(credentials: Credentials, params: QueryParams): Promise<R[]> {
    const limit = this.pageSize(params)
    const queryParams: Record<string, unknown> = {
      page: params.page ?? 1,
      per_page: limit,
    }
    if (params['scroll_id']) queryParams['scroll_id'] = params['scroll_id']
    const { items } = await this.client(credentials).listCursor<R>('/person_events', queryParams)
    reportUpstreamPage(params, { hasMore: items.length >= limit })
    return items
  }

  // ── Contacts (people) ─────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const filters: Record<string, unknown> = {}
    if (params['query']) filters['query'] = params['query']
    const items = await this.listScroll<RawLoxoPerson>(credentials, params, '/people', filters)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawLoxoPerson>(`/people/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawLoxoPerson>('/people', body)
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).patch<RawLoxoPerson>(`/people/${id}`, body)
    return transformContact(raw)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const filters: Record<string, unknown> = {}
    if (params['query']) filters['query'] = params['query']
    const items = await this.listScroll<RawLoxoCompany>(credentials, params, '/companies', filters)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawLoxoCompany>(`/companies/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawLoxoCompany>('/companies', body)
    return transformCompany(raw)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  /**
   * deals:index documents `scroll_id` but not `per_page`, so the upstream
   * page size is Loxo's, not the caller's: the caller's rows are cut out of
   * the scroll chain by pageByRows. The chain ends on an empty page (or an
   * absent scroll_id); a short page proves nothing when the size is unknown.
   */
  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const filters: Record<string, unknown> = {}
    if (params['query']) filters['query'] = params['query']
    const client = this.client(credentials)
    const fetchPage = async (cursor: string | undefined) => {
      const { items, scrollId } = await client.listCursor<RawLoxoDeal>('/deals', {
        ...filters,
        per_page: undefined,
        scroll_id: cursor,
      })
      return { items, next: items.length === 0 ? undefined : scrollId }
    }
    if (params['scroll_id']) {
      const res = await fetchPage(String(params['scroll_id']))
      reportUpstreamPage(params, { hasMore: res.next !== undefined })
      return res.items.map(transformDeal)
    }
    const key = cursorPagerKey(this.scope(credentials), '/deals', filters)
    const { items } = await pageByRows(key, params, fetchPage, { defaultLimit: DEFAULT_PAGE_SIZE })
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawLoxoDeal>(`/deals/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).post<RawLoxoDeal>('/deals', body)
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).patch<RawLoxoDeal>(`/deals/${id}`, body)
    return transformDeal(raw)
  }

  // ── Pipelines (deal_workflows) ─────────────────────────────────────────────

  /** deal_workflows:index documents no query parameters: fetched whole, paged here. */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const res = await this.client(credentials).get<LoxoListResponse<RawLoxoPipeline>>('/deal_workflows')
    return pageLocally(res.results ?? [], params).map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawLoxoPipeline>(`/deal_workflows/${id}`)
    return transformPipeline(raw)
  }

  // ── Activities ─────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPersonEvents<RawLoxoActivity>(credentials, params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawLoxoActivity>(`/person_events/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).post<RawLoxoActivity>('/person_events', body)
    return transformActivity(raw)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.listPersonEvents<RawLoxoNote>(credentials, params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawLoxoNote>(`/person_events/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const raw = await this.client(credentials).post<RawLoxoNote>('/person_events', body)
    return transformNote(raw)
  }
}
