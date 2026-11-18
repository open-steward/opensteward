/**
 * Sellsy CRM adapter for the CRM vertical.
 *
 * Maps the Sellsy REST API v2 to canonical CRM resources.
 * Docs: https://api.sellsy.com/doc/v2/
 *
 * Auth: OAuth2 client credentials (machine-to-machine — no user redirect)
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (21):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete
 *   Pipelines:  list, get (GET /opportunities/pipelines + /{id}/steps)
 *   Activities: list, create
 *   Notes:      list (GET /comments), create
 *   Auth:       exchangeCode (client_credentials), refreshCredentials
 *   Webhooks:   verifyWebhook (stub), parseWebhookEvents (stub)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import {
  oauth2ClientCredentials,
  pageByCursor,
  cursorPagerKey,
  connectionScope,
  reportUpstreamPage,
} from '@opensteward/shared'
import { SellsyClient, type SellsyPage } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { OAUTH_TOKEN_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

const CREDENTIAL_FORM = oauth2ClientCredentials({ tokenUrl: OAUTH_TOKEN_URL })
import { transformContact, untransformContact, type RawSellsyContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawSellsyCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawSellsyDeal } from './transform/deal'
import {
  transformPipeline,
  type RawSellsyPipeline,
  type RawSellsyPipelineStep,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawSellsyActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawSellsyNote } from './transform/note'
import { transformComment, type RawSellsyComment } from './transform/comment'

/**
 * Where a "seek" walk stands: the `pagination.offset` string of the last page
 * ("The offset value represents the LAST object in the response list"), and
 * how many rows the walk has served up to it, to compare with
 * `pagination.total`.
 */
interface SeekCursor {
  offset: string
  seen: number
}

export interface SellsyAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class SellsyAdapter implements CrmAdapter {
  readonly platform = 'sellsy'
  readonly version = '0.1.0'
  /**
   * Every Sellsy v2 list takes the shared `limit` parameter ("The pagination
   * limit", default 25, maximum 100).
   * https://docs.sellsy.com/api/v2/dist/sellsy.v2.latest.yaml
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private clientId: string | undefined
  private clientSecret: string | undefined

  constructor(config: SellsyAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Client credentials flow — no user redirect needed
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Sellsy: clientId and clientSecret required')
    }
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Sellsy token failed: ${text}`)
    }
    const json = (await res.json()) as { access_token: string; expires_in?: number }
    return {
      accessToken: json.access_token,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Re-fetch via client_credentials (no refresh token in this flow)
    return this.exchangeCode('', '').catch(() => credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): SellsyClient {
    return new SellsyClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    const offset = (page - 1) * limit
    return { limit, offset }
  }

  /**
   * One upstream page of a Sellsy v2 list under the default "seek" method
   * (https://docs.sellsy.com/api/v2/dist/sellsy.v2.latest.yaml, "Pagination on
   * list and search requests": "The offset value represents the LAST object in
   * the response list, it's the default one used." and "We recommend to use
   * the \"seek\" method"). Page 1 sends no offset; each later page sends the
   * previous response's `pagination.offset`. The walk ends when the rows served
   * reach `pagination.total`, or on an empty page.
   *
   * The numeric-offset method is not used: the spec says its offset
   * "corresponds to the number of the result page" while its schema example
   * (limit 25, offset 25) reads as a row offset, and it is capped at "the
   * first 100 000 results".
   */
  private async seekPage<R>(
    client: SellsyClient,
    path: string,
    limit: number,
    cursor: SeekCursor | undefined,
  ): Promise<{ items: R[]; next?: SeekCursor; total: number }> {
    const query: Record<string, unknown> = { limit }
    if (cursor) query['offset'] = cursor.offset
    const res = await client.get<SellsyPage<R>>(path, query)
    const seen = (cursor?.seen ?? 0) + res.data.length
    const total = res.pagination.total
    if (res.data.length === 0 || seen >= total) return { items: res.data, total }
    if (typeof res.pagination.offset !== 'string') {
      throw new Error(
        `Sellsy ${path}: ${total - seen} rows remain but pagination.offset is not a seek cursor`,
      )
    }
    return { items: res.data, next: { offset: res.pagination.offset, seen }, total }
  }

  /** Every row of a seek-paged list, at the documented maximum page size. */
  private async seekAll<R>(client: SellsyClient, path: string): Promise<R[]> {
    const rows: R[] = []
    let cursor: SeekCursor | undefined
    do {
      const res = await this.seekPage<R>(client, path, MAX_PAGE_SIZE, cursor)
      rows.push(...res.items)
      cursor = res.next
    } while (cursor)
    return rows
  }

  /**
   * The caller's 1-based page of a seek-paged list, at the caller's limit
   * clamped to the documented maximum (components/parameters/limit:
   * "maximum: 100").
   */
  private async callerPage<R>(
    credentials: Credentials,
    collection: string,
    path: string,
    params: QueryParams,
  ): Promise<{ client: SellsyClient; items: R[] }> {
    const raw = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const asked = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('sellsy', credentials), collection, { limit })
    let total: number | undefined
    const { items, hasMore } = await pageByCursor<R, SeekCursor>(
      key,
      params.page,
      async (cursor) => {
        const res = await this.seekPage<R>(client, path, limit, cursor)
        total = res.total
        return { items: res.items, next: res.next }
      },
    )
    reportUpstreamPage(params, {
      hasMore,
      ...(total !== undefined ? { totalCount: total } : {}),
      ...(limit < asked ? { pageSize: limit } : {}),
    })
    return { client, items }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawSellsyContact>(
      '/contacts',
      this.listParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<{ data: RawSellsyContact }>(`/contacts/${id}`)
    return transformContact(res.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<{ data: RawSellsyContact }>('/contacts', body)
    return transformContact(res.data)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<{ data: RawSellsyContact }>(
      `/contacts/${id}`,
      body,
    )
    return transformContact(res.data)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawSellsyCompany>(
      '/companies',
      this.listParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<{ data: RawSellsyCompany }>(`/companies/${id}`)
    return transformCompany(res.data)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<{ data: RawSellsyCompany }>('/companies', body)
    return transformCompany(res.data)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<{ data: RawSellsyCompany }>(
      `/companies/${id}`,
      body,
    )
    return transformCompany(res.data)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawSellsyDeal>(
      '/opportunities',
      this.listParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<{ data: RawSellsyDeal }>(`/opportunities/${id}`)
    return transformDeal(res.data)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<{ data: RawSellsyDeal }>('/opportunities', body)
    return transformDeal(res.data)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<{ data: RawSellsyDeal }>(
      `/opportunities/${id}`,
      body,
    )
    return transformDeal(res.data)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * GET /opportunities/pipelines ("Get list of opportunity pipelines"), seek
   * paged. Its rows carry only a step count ("Count of steps"), so each
   * pipeline's stages come from GET /opportunities/pipelines/{pipelineId}/steps
   * ("Get list of opportunity pipeline steps"), walked in full.
   * https://docs.sellsy.com/api/v2/dist/sellsy.v2.latest.yaml
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const { client, items } = await this.callerPage<RawSellsyPipeline>(
      credentials,
      'pipelines',
      '/opportunities/pipelines',
      params,
    )
    const out: Pipeline[] = []
    for (const raw of items) out.push(await this.withSteps(client, raw))
    return out
  }

  /**
   * The spec has no single-pipeline GET (its pipeline paths are
   * /opportunities/pipelines, its /search, and /{pipelineId}/steps), and the
   * search filters are only `name` and `is_default`. So the pipeline is found
   * by walking the documented list.
   */
  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const client = this.client(credentials)
    let cursor: SeekCursor | undefined
    do {
      const res = await this.seekPage<RawSellsyPipeline>(
        client,
        '/opportunities/pipelines',
        MAX_PAGE_SIZE,
        cursor,
      )
      const hit = res.items.find((p) => String(p.id) === id)
      if (hit) return this.withSteps(client, hit)
      cursor = res.next
    } while (cursor)
    throw Object.assign(new Error(`Sellsy pipeline ${id} not found`), { statusCode: 404 })
  }

  private async withSteps(client: SellsyClient, raw: RawSellsyPipeline): Promise<Pipeline> {
    const steps = await this.seekAll<RawSellsyPipelineStep>(
      client,
      `/opportunities/pipelines/${encodeURIComponent(String(raw.id))}/steps`,
    )
    return transformPipeline(raw, steps)
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawSellsyActivity>(
      '/tasks',
      this.listParams(params),
    )
    return items.map(transformActivity)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<{ data: RawSellsyActivity }>('/tasks', body)
    return transformActivity(res.data)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  /**
   * Sellsy v2 has no notes path; its free-text record on a company, contact or
   * opportunity is the comment: GET /comments ("Comments List", "Get a list
   * of comments"), seek paged.
   * https://docs.sellsy.com/api/v2/dist/sellsy.v2.latest.yaml
   */
  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.callerPage<RawSellsyComment>(
      credentials,
      'comments',
      '/comments',
      params,
    )
    return items.map(transformComment)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<{ data: RawSellsyNote }>('/notes', body)
    return transformNote(res.data)
  }
}
