import { pageLocally, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
/**
 * Streak adapter for the CRM vertical.
 *
 * Streak is a pipeline-centric CRM built inside Gmail. Its data model centres
 * on "pipelines" and "boxes" (deals) rather than explicit contact/company
 * objects. This adapter maps those concepts to canonical CRM resources:
 *
 * | Streak concept | Canonical resource |
 * |----------------|--------------------|
 * | Pipeline       | Pipeline           |
 * | Box            | Deal               |
 * | Contact        | Contact            |
 * | Box comment    | Note               |
 *
 * **Coverage**
 * - Contacts:  list, get, create, update, delete  ✓
 * - Companies: —  (no dedicated resource)         501
 * - Deals:     list, get, create, update, delete  ✓
 * - Pipelines: list, get                          ✓
 * - Activities: —  (no dedicated resource)        501
 * - Notes:     list (box comments), create,
 *              delete                             ✓
 *
 * **Auth**: API-key via HTTP Basic — API key is the username, password is empty.
 * `exchangeCode` converts the raw key to the base64 form expected by Basic auth.
 *
 * Docs: https://streak.readme.io/
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Note } from '../../schema/note'

import { StreakClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyStreakWebhook, parseStreakWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawStreakContact } from './transform/contact'
import { transformDeal, untransformDeal, type RawStreakBox } from './transform/deal'
import { transformPipeline, type RawStreakPipeline } from './transform/pipeline'
import { transformNote, untransformNote, type RawStreakComment } from './transform/note'

export interface StreakAdapterConfig {
  /**
   * Streak API key. If provided the adapter skips OAuth and stores the
   * base64-encoded key directly as `credentials.accessToken`.
   */
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class StreakAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'streak'
  readonly version = '0.1.0'

  private apiKey: string | undefined

  constructor(config: StreakAdapterConfig = {}) {
    this.apiKey = config.apiKey
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Streak uses API-key auth, not OAuth2; direct users to their settings page
    return 'https://www.streak.com/api'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    const key = this.apiKey ?? _code
    // Encode as base64(apiKey:) for HTTP Basic usage
    const encoded = Buffer.from(`${key}:`).toString('base64')
    return { accessToken: encoded }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyStreakWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseStreakWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): StreakClient {
    const effective: Credentials = this.apiKey
      ? { accessToken: Buffer.from(`${this.apiKey}:`).toString('base64') }
      : credentials
    return new StreakClient(effective)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawStreakContact>('/contacts', {
      page: params['page'],
      limit: params['limit'],
    })
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawStreakContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawStreakContact>('/contacts', body)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawStreakContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Deals (Boxes) ─────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    let pipelineKey = params['pipeline_id'] as string | undefined

    if (!pipelineKey) {
      // No pipeline specified — fetch from the first available pipeline.
      // GET /pipelines documents no paging parameters, so send none.
      const { items: pipelines } = await this.client(credentials).list<{ key: string }>(
        '/pipelines',
        {},
        { defaultLimit: false },
      )
      if (pipelines.length === 0) return []
      pipelineKey = pipelines[0]!.key
    }

    // Boxes page by a 0-indexed page number: "The page number you'd like to
    // view. If there are more results to show, `hasNextPage` will be `true`.
    // Pages are 0 indexed." The caller's `page` is 1-based.
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const { items, hasNextPage } = await this.client(credentials).list<RawStreakBox>(
      `/pipelines/${pipelineKey}/boxes`,
      { page: Math.max(1, params.page ?? 1) - 1, limit },
    )
    reportUpstreamPage(
      params,
      hasNextPage === undefined ? { pageSize: limit } : { hasMore: hasNextPage, pageSize: limit },
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawStreakBox>(`/boxes/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const pipelineKey = data.pipeline_id
    if (!pipelineKey) {
      throw new Error('Streak createDeal: pipeline_id is required')
    }
    const body = untransformDeal(data)
    const raw = await this.client(credentials).post<RawStreakBox>(
      `/pipelines/${pipelineKey}/boxes`,
      body,
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).post<RawStreakBox>(
      `/boxes/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/boxes/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // GET /pipelines is not paginated (`sortBy` is its only documented query
    // parameter): fetch the whole list and slice the caller's page locally.
    const { items } = await this.client(credentials).list<RawStreakPipeline>(
      '/pipelines',
      {},
      { defaultLimit: false },
    )
    return pageLocally(items.map(transformPipeline), params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawStreakPipeline>(`/pipelines/${id}`)
    return transformPipeline(raw)
  }

  // ── Notes (Box Comments) ──────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const boxKey = params['deal_id'] as string | undefined
    if (!boxKey) {
      // Without a box key we cannot list comments — return empty
      return []
    }
    const { items } = await this.client(credentials).list<RawStreakComment>(
      `/boxes/${boxKey}/comments`,
    )
    // Inject the box key so the transform can populate deal_id
    return items.map((c) => transformNote({ ...c, _boxKey: boxKey }))
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const boxKey = data.deal_id
    if (!boxKey) {
      throw new Error('Streak createNote: deal_id (box key) is required')
    }
    const body = untransformNote(data)
    const raw = await this.client(credentials).post<RawStreakComment>(
      `/boxes/${boxKey}/comments`,
      body,
    )
    return transformNote({ ...raw, _boxKey: boxKey })
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/comments/${id}`)
  }
}
