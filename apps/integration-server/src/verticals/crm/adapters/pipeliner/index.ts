import {
  simpleApiKey,
  pageByCursor,
  cursorPagerKey,
  connectionScope,
  reportUpstreamPage,
} from '@opensteward/shared'
/**
 * Pipeliner CRM adapter for the CRM vertical.
 *
 * Maps the Pipeliner Sales REST API v100 to canonical CRM resources. Uses
 * HTTP Basic authentication — `credentials.accessToken` is the API token and
 * `credentials.extra.username` is the API username. The Pipeliner space/
 * environment ID is read from `credentials.extra.spaceId`.
 *
 * No OAuth2 flow is required; `getAuthUrl` and `exchangeCode` are stubs that
 * signal the consumer to provide Basic credentials directly.
 *
 * Docs: https://pipeliner.biz/api-docs/
 * Base URL: https://eu-central.pipelinersales.com/api/v100/rest/spaces/{spaceId}/entities
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { PipelinerClient } from './client'
import { PIPELINER_MAX_PAGE_SIZE } from './constants'
import { verifyPipelinerWebhook, parsePipelinerWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawPipelinerContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawPipelinerAccount } from './transform/company'
import { transformDeal, untransformDeal, type RawPipelinerOpportunity } from './transform/deal'
import { transformPipeline, type RawPipelinerPipeline } from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawPipelinerActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawPipelinerNote } from './transform/note'

/** No config needed — all auth context comes from credentials at runtime. */
export type PipelinerAdapterConfig = Record<string, never>
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class PipelinerAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'pipeliner'
  readonly version = '0.1.0'

  constructor(_config: PipelinerAdapterConfig = {}) {}

  // ── Auth (Basic — no OAuth2) ───────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Pipeliner uses API key / Basic auth — no OAuth2 redirect required
    return '#basic-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // For Basic auth integrations the caller sets credentials directly;
    // this method is not used in normal flow.
    throw new Error(
      'Pipeliner uses Basic auth — set credentials.accessToken and credentials.extra directly',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Basic auth tokens do not expire
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPipelinerWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePipelinerWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): PipelinerClient {
    return new PipelinerClient(credentials)
  }

  /**
   * One caller page of an entity collection. Pipeliner pages with `first`
   * (maximum 100, default 30) and the previous page's `page_info.end_cursor`
   * as `after`, ending when `has_next_page` is false — so upstream page k IS
   * caller page k at the size sent. `first` is always sent so the default of
   * 30 never decides the page size.
   */
  private async pageEntities<T>(
    credentials: Credentials,
    entity: string,
    params: QueryParams,
    extra: Record<string, string> = {},
  ): Promise<T[]> {
    const asked =
      typeof params.limit === 'number' && params.limit >= 1
        ? Math.floor(params.limit)
        : PIPELINER_MAX_PAGE_SIZE
    const first = Math.min(asked, PIPELINER_MAX_PAGE_SIZE)
    const client = this.client(credentials)
    const spaceId = String(credentials.extra?.['spaceId'] ?? '')
    const username = String(credentials.extra?.['username'] ?? '')
    const key = cursorPagerKey(
      connectionScope(`pipeliner:${spaceId}:${username}`, credentials),
      entity,
      { limit: first },
    )
    let total: number | undefined
    const { items, hasMore } = await pageByCursor<T>(key, params.page, async (after) => {
      const res = await client.list<T>(entity, { ...extra, first, after })
      total = res.total
      return { items: res.items, next: res.hasNextPage && res.endCursor ? res.endCursor : null }
    })
    reportUpstreamPage(params, {
      hasMore,
      pageSize: first,
      ...(total != null ? { totalCount: total } : {}),
    })
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.pageEntities<RawPipelinerContact>(credentials, '/Contacts', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawPipelinerContact>(`/Contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawPipelinerContact>(
      '/Contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawPipelinerContact>(
      `/Contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Contacts/${id}`)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.pageEntities<RawPipelinerAccount>(credentials, '/Accounts', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawPipelinerAccount>(`/Accounts/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawPipelinerAccount>(
      '/Accounts',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawPipelinerAccount>(
      `/Accounts/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Accounts/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.pageEntities<RawPipelinerOpportunity>(
      credentials,
      '/Opportunities',
      params,
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawPipelinerOpportunity>(`/Opportunities/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawPipelinerOpportunity>(
      '/Opportunities',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawPipelinerOpportunity>(
      `/Opportunities/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Opportunities/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * Stages are embedded with `expand=steps`, the api-parameters page's own
   * example: "{{baseUrl}}/entities/Pipelines?expand=steps". Without it "the
   * URI link will be returned instead".
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const items = await this.pageEntities<RawPipelinerPipeline>(credentials, '/Pipelines', params, {
      expand: 'steps',
    })
    return items.map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawPipelinerPipeline>(
      `/Pipelines/${encodeURIComponent(id)}`,
      { expand: 'steps' },
    )
    return transformPipeline(raw)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.pageEntities<RawPipelinerActivity>(credentials, '/Activities', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawPipelinerActivity>(`/Activities/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawPipelinerActivity>(
      '/Activities',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).put<RawPipelinerActivity>(
      `/Activities/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Activities/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.pageEntities<RawPipelinerNote>(credentials, '/Notes', params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawPipelinerNote>(`/Notes/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawPipelinerNote>(
      '/Notes',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).put<RawPipelinerNote>(
      `/Notes/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Notes/${id}`)
  }
}
