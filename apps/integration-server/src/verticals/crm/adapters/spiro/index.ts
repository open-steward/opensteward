/**
 * Spiro adapter — CRM resource coverage for the OpenSteward CRM vertical.
 *
 * Reads, against the documented REST host https://api.spiro.ai:
 *   • Contacts   → GET /api/v1/contacts, /api/v1/contacts/{id}
 *   • Companies  → GET /api/v1/companies, /api/v1/companies/{id}
 *   • Deals      → GET /api/v1/opportunities, /api/v1/opportunities/{id}
 *   • Pipelines  → GET /api/v1/pipelines (+ /api/v1/pipelines/{pipeline_id}/opportunity_stages)
 *   • Activities → GET /api/v1/activities
 *   • Notes      → GET /api/v1/notes
 *
 * Pipelines, activities and notes have no documented GET-by-id, so their get*
 * reads the list filtered on the `id` attribute, per the spec's filter rule:
 * "Each resource may be filtered by any of its attributes using the available
 * predicates. Filters are added to requests as parameters with the syntax
 * `filter[{{attribute}}_{{predicate}}]={{value}}`."
 *
 * Auth: OAuth 2.0 authorization-code flow via engine.spiro.ai/oauth.
 * Paging: `page[number]` + `page[size]`; the end of a collection is
 * `meta.pagination.next_page: null`.
 *
 * Write methods are unchanged from the earlier adapter: their bodies are not
 * JSON:API documents, and the contact writes still address /api/v1/people,
 * which the spec does not list.
 *
 * Webhooks: Spiro documents /api/v1/webhooks and signed deliveries ("This
 * hash signature is included with the headers of each request as
 * `X-Spiro-Signature`" ... "Spiro uses an HMAC hex digest to compute the
 * hash"), but this adapter does not implement verifyWebhook /
 * parseWebhookEvents yet.
 *
 * Docs: https://developers.spiro.ai/api/docs/v1/openapi.json
 */

import { reportUpstreamPage } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import {
  SpiroClient,
  type SpiroDocument,
  type SpiroListDocument,
  type SpiroResource,
} from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshToken as doRefreshToken,
} from './auth'
import {
  transformContact,
  untransformContact,
  type SpiroContactAttributes,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type SpiroCompanyAttributes,
} from './transform/company'
import { transformDeal, untransformDeal, type SpiroOpportunityAttributes } from './transform/deal'
import {
  transformPipeline,
  type RawSpiroPipeline,
  type RawSpiroPipelineStage,
  type SpiroPipelineAttributes,
  type SpiroStageAttributes,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type SpiroActivityAttributes,
} from './transform/activity'
import { transformNote, untransformNote, type SpiroNoteAttributes } from './transform/note'
import { DEFAULT_SPIRO_SCOPES } from './constants'

export interface SpiroAdapterConfig {
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** OAuth scopes to request. Defaults to DEFAULT_SPIRO_SCOPES when omitted. */
  scopes?: string[]
}

function notFound(resource: string, id: string): Error {
  return Object.assign(new Error(`Spiro ${resource} ${id} not found`), { statusCode: 404 })
}

export class SpiroAdapter implements CrmAdapter {
  readonly platform = 'spiro'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]

  constructor(config: SpiroAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? [...DEFAULT_SPIRO_SCOPES]
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      {
        clientId: this.clientId ?? '',
        clientSecret: this.clientSecret ?? '',
        redirectUri: this.redirectUri ?? '',
        scopes: overrideScopes ?? this.scopes,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Spiro exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode(
      {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        redirectUri,
      },
      code,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const extra = credentials.extra as Record<string, string> | undefined
    const clientId = this.clientId ?? extra?.['clientId'] ?? ''
    const clientSecret = this.clientSecret ?? extra?.['clientSecret'] ?? ''
    return doRefreshToken({ clientId, clientSecret }, credentials)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): SpiroClient {
    return new SpiroClient(credentials)
  }

  /**
   * The caller's page of a documented list endpoint: `page[number]` is the
   * caller's 1-based page (1 when absent or not a whole number ≥ 1) and
   * `page[size]` its exact limit. The spec gives `page[size]` only as
   * `{ "type": "integer", "example": 50 }` with no maximum, so nothing is
   * clamped; a limit that is not a whole number ≥ 1 sends no size and takes
   * Spiro's default.
   *
   * The end signal is Spiro's own: `meta.pagination.next_page` is null on the
   * last page. When Spiro served fewer rows per page than asked for
   * (`per_page` below the size sent), that size is reported so the page is
   * judged at it.
   */
  private async listPage<A>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<SpiroResource<A>[]> {
    const page = Number(params.page)
    const limit = Number(params.limit)
    const size = Number.isInteger(limit) && limit >= 1 ? limit : undefined
    const doc = await this.client(credentials).list<A>(path, {
      'page[number]': Number.isInteger(page) && page >= 1 ? page : 1,
      'page[size]': size,
    })
    const pagination = doc.meta?.pagination
    if (pagination) {
      reportUpstreamPage(params, {
        hasMore: pagination.next_page != null,
        totalPages: pagination.total_pages,
        currentPage: pagination.current_page,
        ...(size !== undefined && pagination.per_page >= 1 && pagination.per_page < size
          ? { pageSize: pagination.per_page }
          : {}),
      })
    }
    return doc.data
  }

  /**
   * Every page of a list, following `meta.pagination.next_page` until it is
   * null. Used only for one pipeline's stages, which a pipeline embeds as ids.
   */
  private async listAll<A>(credentials: Credentials, path: string): Promise<SpiroResource<A>[]> {
    const out: SpiroResource<A>[] = []
    let page: number | null = 1
    while (page != null) {
      const doc: SpiroListDocument<A> = await this.client(credentials).list<A>(path, {
        'page[number]': page,
      })
      out.push(...doc.data)
      const next: number | null | undefined = doc.meta?.pagination?.next_page
      page = next != null && next > page ? next : null
    }
    return out
  }

  /** One record found through `filter[id_eq]` on a list endpoint. */
  private async findById<A>(
    credentials: Credentials,
    path: string,
    id: string,
    resource: string,
  ): Promise<SpiroResource<A>> {
    const doc = await this.client(credentials).list<A>(path, { 'filter[id_eq]': id })
    const found = doc.data.find((r) => r.id === id)
    if (!found) throw notFound(resource, id)
    return found
  }

  private async withStages(
    credentials: Credentials,
    pipeline: RawSpiroPipeline,
  ): Promise<Pipeline> {
    const stages: RawSpiroPipelineStage[] = await this.listAll<SpiroStageAttributes>(
      credentials,
      `/api/v1/pipelines/${encodeURIComponent(pipeline.id)}/opportunity_stages`,
    )
    return transformPipeline(pipeline, stages)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.listPage<SpiroContactAttributes>(
      credentials,
      '/api/v1/contacts',
      params,
    )
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const doc = await this.client(credentials).get<SpiroDocument<SpiroContactAttributes>>(
      `/api/v1/contacts/${encodeURIComponent(id)}`,
    )
    return transformContact(doc.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const doc = await this.client(credentials).post<SpiroDocument<SpiroContactAttributes>>(
      '/api/v1/people',
      untransformContact(data),
    )
    return transformContact(doc.data)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const doc = await this.client(credentials).put<SpiroDocument<SpiroContactAttributes>>(
      `/api/v1/people/${id}`,
      untransformContact(data),
    )
    return transformContact(doc.data)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/api/v1/people/${id}`)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const rows = await this.listPage<SpiroCompanyAttributes>(
      credentials,
      '/api/v1/companies',
      params,
    )
    return rows.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const doc = await this.client(credentials).get<SpiroDocument<SpiroCompanyAttributes>>(
      `/api/v1/companies/${encodeURIComponent(id)}`,
    )
    return transformCompany(doc.data)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const doc = await this.client(credentials).post<SpiroDocument<SpiroCompanyAttributes>>(
      '/api/v1/companies',
      untransformCompany(data),
    )
    return transformCompany(doc.data)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const doc = await this.client(credentials).put<SpiroDocument<SpiroCompanyAttributes>>(
      `/api/v1/companies/${id}`,
      untransformCompany(data),
    )
    return transformCompany(doc.data)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/api/v1/companies/${id}`)
  }

  // ── Deals (opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const rows = await this.listPage<SpiroOpportunityAttributes>(
      credentials,
      '/api/v1/opportunities',
      params,
    )
    return rows.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const doc = await this.client(credentials).get<SpiroDocument<SpiroOpportunityAttributes>>(
      `/api/v1/opportunities/${encodeURIComponent(id)}`,
    )
    return transformDeal(doc.data)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const doc = await this.client(credentials).post<SpiroDocument<SpiroOpportunityAttributes>>(
      '/api/v1/opportunities',
      untransformDeal(data),
    )
    return transformDeal(doc.data)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const doc = await this.client(credentials).put<SpiroDocument<SpiroOpportunityAttributes>>(
      `/api/v1/opportunities/${id}`,
      untransformDeal(data),
    )
    return transformDeal(doc.data)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/api/v1/opportunities/${id}`)
  }

  // ── Pipelines ──────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const rows = await this.listPage<SpiroPipelineAttributes>(
      credentials,
      '/api/v1/pipelines',
      params,
    )
    // One pipeline's stages at a time: every pipeline needs at least one stage
    // request, Spiro documents no rate limit, and a page of `limit` pipelines
    // must not become `limit` concurrent requests.
    const out: Pipeline[] = []
    for (const row of rows) out.push(await this.withStages(credentials, row))
    return out
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const row = await this.findById<SpiroPipelineAttributes>(
      credentials,
      '/api/v1/pipelines',
      id,
      'pipeline',
    )
    return this.withStages(credentials, row)
  }

  // ── Activities ─────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const rows = await this.listPage<SpiroActivityAttributes>(
      credentials,
      '/api/v1/activities',
      params,
    )
    return rows.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const row = await this.findById<SpiroActivityAttributes>(
      credentials,
      '/api/v1/activities',
      id,
      'activity',
    )
    return transformActivity(row)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const doc = await this.client(credentials).post<SpiroDocument<SpiroActivityAttributes>>(
      '/api/v1/activities',
      untransformActivity(data),
    )
    return transformActivity(doc.data)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const doc = await this.client(credentials).put<SpiroDocument<SpiroActivityAttributes>>(
      `/api/v1/activities/${id}`,
      untransformActivity(data),
    )
    return transformActivity(doc.data)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/api/v1/activities/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const rows = await this.listPage<SpiroNoteAttributes>(credentials, '/api/v1/notes', params)
    return rows.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const row = await this.findById<SpiroNoteAttributes>(credentials, '/api/v1/notes', id, 'note')
    return transformNote(row)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const doc = await this.client(credentials).post<SpiroDocument<SpiroNoteAttributes>>(
      '/api/v1/notes',
      untransformNote(data),
    )
    return transformNote(doc.data)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const doc = await this.client(credentials).put<SpiroDocument<SpiroNoteAttributes>>(
      `/api/v1/notes/${id}`,
      untransformNote(data),
    )
    return transformNote(doc.data)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/api/v1/notes/${id}`)
  }
}
