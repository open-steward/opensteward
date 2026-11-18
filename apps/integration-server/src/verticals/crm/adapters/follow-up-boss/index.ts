/**
 * Follow Up Boss adapter for the CRM vertical.
 *
 * Maps the Follow Up Boss REST API v1 to canonical CRM resources.
 * Docs: https://docs.followupboss.com/
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 *   HTTP Basic Authentication — API key as username, empty password.
 *   credentials.accessToken = API key
 *   Obtain from Admin → API in your Follow Up Boss account.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *
 * Implemented (12):
 *   Contacts (people): list, get, create, update, delete
 *   Deals:             list, get, create, update, delete
 *   Notes:             list, get, create, update, delete
 *   Pipelines:         list, get
 *   Activities (tasks): list, get, create, update, delete
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Companies — Follow Up Boss has no first-class company/account resource
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: company — Follow Up Boss has no first-class company/account resource; the API has no /companies or equivalent endpoint.

import { pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Deal } from '../../schema/deal'
import type { Note } from '../../schema/note'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { WebhookEvent } from '../../schema/webhook'

import { FollowUpBossClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawFollowUpBossPerson,
} from './transform/contact'
import {
  transformDeal,
  untransformDeal,
  type RawFollowUpBossDeal,
} from './transform/deal'
import {
  transformNote,
  untransformNote,
  type RawFollowUpBossNote,
} from './transform/note'
import {
  transformPipeline,
  type RawFollowUpBossPipeline,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawFollowUpBossTask,
} from './transform/activity'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText: 'Obtain from Admin → API in your Follow Up Boss account.',
})

export class FollowUpBossAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'follow-up-boss'
  readonly version = '0.1.0'
  /** https://docs.followupboss.com/reference/pagination: "The maximum value for the limit parameter is `100`." */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Follow Up Boss uses API key auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes the API key as code.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ─────────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): FollowUpBossClient {
    return new FollowUpBossClient(credentials)
  }

  /**
   * One caller page of a FUB collection. Per
   * https://docs.followupboss.com/reference/pagination, lists "are paginated
   * using `next` or `offset` and `limit` query parameters", limit max 100.
   * `offset` is derived from the 1-based `page` at the clamped size, and the
   * end is read from `_metadata.total`.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    collectionKey: string,
    params: QueryParams,
  ): Promise<T[]> {
    const requested = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Math.max(1, Math.min(Math.floor(requested), MAX_PAGE_SIZE))
    const offset = pageOffset(params, limit)
    const { items, total } = await this.client(credentials).list<T>(path, collectionKey, {
      limit,
      offset,
    })
    reportUpstreamPage(params, {
      pageSize: limit,
      ...(typeof total === 'number'
        ? { totalCount: total, hasMore: offset + items.length < total }
        : {}),
    })
    return items
  }

  // ── Contacts (People) ────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawFollowUpBossPerson>(credentials, '/people', 'people', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawFollowUpBossPerson>(`/people/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawFollowUpBossPerson>(
      '/people',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).put<RawFollowUpBossPerson>(
      `/people/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/people/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<RawFollowUpBossDeal>(credentials, '/deals', 'deals', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawFollowUpBossDeal>(`/deals/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawFollowUpBossDeal>(
      '/deals',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawFollowUpBossDeal>(
      `/deals/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.listPage<RawFollowUpBossNote>(credentials, '/notes', 'notes', params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawFollowUpBossNote>(`/notes/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawFollowUpBossNote>(
      '/notes',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).put<RawFollowUpBossNote>(
      `/notes/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const items = await this.listPage<RawFollowUpBossPipeline>(
      credentials,
      '/pipelines',
      'pipelines',
      params,
    )
    return items.map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawFollowUpBossPipeline>(`/pipelines/${id}`)
    return transformPipeline(raw)
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPage<RawFollowUpBossTask>(credentials, '/tasks', 'tasks', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawFollowUpBossTask>(`/tasks/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawFollowUpBossTask>(
      '/tasks',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(credentials: Credentials, id: string, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).put<RawFollowUpBossTask>(
      `/tasks/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/tasks/${id}`)
  }
}
