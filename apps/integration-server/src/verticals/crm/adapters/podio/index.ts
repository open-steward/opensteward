/**
 * Podio adapter for the CRM vertical.
 *
 * Podio is app-centric: contacts, companies, and deals live in user-configured
 * apps. App IDs are read from `credentials.extra` at runtime:
 *   - contactAppId
 *   - companyAppId
 *   - dealAppId
 *
 * Pipelines are synthesised from the stage category field options of the deal
 * app. Activities return 501 (Podio activity streams don't map to the canonical
 * Activity model cleanly). Notes are implemented as Podio item comments —
 * `contact_id` must be provided when listing notes.
 *
 * Coverage:
 *   Contacts      — list, get, create, update, delete  (full CRUD)
 *   Companies     — list, get, create, update, delete  (full CRUD)
 *   Deals         — list, get, create, update, delete  (full CRUD)
 *   Pipelines     — list, get                          (read-only; synthesised from stage field options)
 *   Activities    — 501 (not implemented)
 *   Notes         — list, get, create, delete          (Podio comments; no update)
 *
 * Auth: OAuth2 Authorization Code.
 * Docs: https://developers.podio.com/doc/reference
 */

import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Note } from '../../schema/note'

import { PodioClient, type PodioItem } from './client'
import { OAUTH_AUTH_URL, OAUTH_TOKEN_URL, DEAL_FIELDS } from './constants'
import { transformContact, untransformContact } from './transform/contact'
import { transformCompany, untransformCompany } from './transform/company'
import { transformDeal, untransformDeal } from './transform/deal'
import { transformPipeline, type PodioStageOption } from './transform/pipeline'
import { transformNote, type RawPodioComment } from './transform/note'

export interface PodioAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class PodioAdapter implements CrmAdapter {
  readonly platform = 'podio'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: PodioAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private extra(credentials: Credentials): Record<string, string> {
    return (credentials.extra ?? {}) as Record<string, string>
  }

  private contactAppId(credentials: Credentials): string {
    const id = this.extra(credentials)['contactAppId']
    if (!id) throw new Error('Podio: credentials.extra.contactAppId is required')
    return id
  }

  private companyAppId(credentials: Credentials): string {
    const id = this.extra(credentials)['companyAppId']
    if (!id) throw new Error('Podio: credentials.extra.companyAppId is required')
    return id
  }

  private dealAppId(credentials: Credentials): string {
    const id = this.extra(credentials)['dealAppId']
    if (!id) throw new Error('Podio: credentials.extra.dealAppId is required')
    return id
  }

  private client(credentials: Credentials): PodioClient {
    return new PodioClient(credentials)
  }

  /**
   * One caller page of an item app via Get items
   * (https://developers.podio.com/doc/items/get-items-27803): `limit` is "The
   * maximum number of items to return", `offset` "The offset from the start
   * of the items returned", and `filtered` the "Total number of items
   * matching the filter". No maximum is documented, so the caller's limit is
   * sent as is and the offset strides by it.
   */
  private async listItemsPage(
    credentials: Credentials,
    appId: string,
    params: QueryParams,
  ): Promise<PodioItem[]> {
    const limit = params.limit ?? 25
    const offset = pageOffset(params, limit)
    const { items, total, filtered } = await this.client(credentials).listItems(
      appId,
      limit,
      offset,
    )
    const count = filtered ?? total
    if (count !== undefined) {
      reportUpstreamPage(params, {
        totalCount: count,
        hasMore: offset + items.length < count,
      })
    }
    return items
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const url = new URL(OAUTH_AUTH_URL)
    url.searchParams.set('client_id', this.clientId ?? '')
    url.searchParams.set('redirect_uri', this.redirectUri ?? '')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', state)
    return url.toString()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Podio exchangeCode: clientId and clientSecret required')
    }
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        code,
      }).toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Podio token exchange failed: ${text}`)
    }
    const json = await res.json() as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in
        ? new Date(Date.now() + json.expires_in * 1000)
        : undefined,
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    if (!this.clientId || !this.clientSecret) return credentials
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: credentials.refreshToken,
      }).toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Podio token refresh failed: ${text}`)
    }
    const json = await res.json() as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }
    return {
      ...credentials,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? credentials.refreshToken,
      expiresAt: json.expires_in
        ? new Date(Date.now() + json.expires_in * 1000)
        : undefined,
    }
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(
    _payload: Buffer,
    _headers: Record<string, string>,
    _secret: string,
  ): boolean {
    return true
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return [{
      platform: this.platform,
      type: String(payload['type'] ?? 'unknown'),
      resourceType: 'unknown',
      action: 'unknown',
      resourceId: String(payload['item_id'] ?? payload['id'] ?? 'unknown'),
      payload,
    }]
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listItemsPage(credentials, this.contactAppId(credentials), params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).getItem(id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).createItem(
      this.contactAppId(credentials),
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).updateItem(id, untransformContact(data))
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteItem(id)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listItemsPage(credentials, this.companyAppId(credentials), params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).getItem(id)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).createItem(
      this.companyAppId(credentials),
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).updateItem(id, untransformCompany(data))
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteItem(id)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listItemsPage(credentials, this.dealAppId(credentials), params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).getItem(id)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).createItem(
      this.dealAppId(credentials),
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).updateItem(id, untransformDeal(data))
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteItem(id)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const dealAppId = this.dealAppId(credentials)
    const app = await this.client(credentials).getApp(dealAppId)
    const fields = (app['fields'] as Array<Record<string, unknown>> | undefined) ?? []
    const stageField = fields.find(
      (f) => (f['external_id'] as string | undefined) === DEAL_FIELDS.STAGE,
    )
    const config = stageField?.['config'] as Record<string, unknown> | undefined
    const settings = config?.['settings'] as Record<string, unknown> | undefined
    const options = (settings?.['options'] as PodioStageOption[] | undefined) ?? []
    // Get app takes only app_id and returns one definition: one row, paged here.
    return pageLocally([transformPipeline(dealAppId, options, app)], params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const pipelines = await this.listPipelines(credentials, {})
    const found = pipelines.find((p) => p.id === id)
    if (!found) {
      throw Object.assign(new Error(`Podio: pipeline not found: ${id}`), { statusCode: 404 })
    }
    return found
  }

  // ── Notes (Podio comments) ─────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const contactId = params['contact_id'] as string | undefined
    if (!contactId) {
      throw new Error('Podio listNotes: contact_id param is required')
    }
    const comments = await this.client(credentials).listComments(contactId)
    return (comments as RawPodioComment[]).map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).getComment(id)
    return transformNote(raw as RawPodioComment)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const itemId = data.contact_id ?? data.deal_id ?? data.company_id
    if (!itemId) {
      throw new Error('Podio createNote: contact_id, deal_id, or company_id is required')
    }
    const raw = await this.client(credentials).createComment(itemId, {
      value: data.content ?? '',
    })
    return transformNote(raw as RawPodioComment)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteComment(id)
  }
}
