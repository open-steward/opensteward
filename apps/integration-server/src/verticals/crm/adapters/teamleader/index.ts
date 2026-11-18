/**
 * Teamleader Focus CRM adapter for the CRM vertical.
 *
 * Maps the Teamleader Focus API to canonical CRM resources.
 * Docs: https://developer.teamleader.eu/
 *
 * Auth: OAuth2 authorization code
 * Notable: Teamleader uses POST requests for all reads (action-based API)
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (19):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create
 *   Pipelines:  list (dealPipelines.list, stages from dealPhases.list)
 *   Notes:      list, create
 *   Auth:       getAuthUrl, exchangeCode, refreshCredentials
 *   Webhooks:   verifyWebhook (stub), parseWebhookEvents (stub)
 */

import { reportUpstreamPage } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { TeamleaderClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { OAUTH_AUTH_URL, OAUTH_TOKEN_URL, DEFAULT_PAGE_SIZE } from './constants'
import {
  transformContact,
  untransformContact,
  type RawTeamleaderContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawTeamleaderCompany,
} from './transform/company'
import { transformDeal, untransformDeal, type RawTeamleaderDeal } from './transform/deal'
import {
  transformPipeline,
  type RawTeamleaderDealPipeline,
  type RawTeamleaderDealPhase,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawTeamleaderActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawTeamleaderNote } from './transform/note'

/** dealPhases.list's documented default `page.size` (20), used to walk every phase of a pipeline. */
const PHASE_PAGE_SIZE = DEFAULT_PAGE_SIZE

export interface TeamleaderAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class TeamleaderAdapter implements CrmAdapter {
  readonly platform = 'teamleader'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: TeamleaderAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
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
      throw new Error('Teamleader: clientId and clientSecret required')
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
      throw new Error(`Teamleader token exchange failed: ${text}`)
    }
    const json = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken || !this.clientId || !this.clientSecret) return credentials
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
    if (!res.ok) return credentials
    const json = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }
    return {
      ...credentials,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? credentials.refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    }
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): TeamleaderClient {
    return new TeamleaderClient(credentials)
  }

  private pageParams(params: QueryParams): { page?: number; pageSize?: number } {
    return {
      page: Number(params['page'] ?? 1),
      pageSize: Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawTeamleaderContact>(
      'contacts.list',
      this.pageParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).action<{ data: RawTeamleaderContact }>(
      'contacts.info',
      { id },
    )
    return transformContact(res.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).action<{ data: { id: string } }>(
      'contacts.add',
      body,
    )
    return this.getContact(credentials, res.data.id)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    await this.client(credentials).action('contacts.update', { id, ...body })
    return this.getContact(credentials, id)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).action('contacts.delete', { id })
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawTeamleaderCompany>(
      'companies.list',
      this.pageParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).action<{ data: RawTeamleaderCompany }>(
      'companies.info',
      { id },
    )
    return transformCompany(res.data)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).action<{ data: { id: string } }>(
      'companies.add',
      body,
    )
    return this.getCompany(credentials, res.data.id)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    await this.client(credentials).action('companies.update', { id, ...body })
    return this.getCompany(credentials, id)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).action('companies.delete', { id })
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawTeamleaderDeal>(
      'deals.list',
      this.pageParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).action<{ data: RawTeamleaderDeal }>('deals.info', {
      id,
    })
    return transformDeal(res.data)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).action<{ data: { id: string } }>(
      'deals.create',
      body,
    )
    return this.getDeal(credentials, res.data.id)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * POST /dealPipelines.list, "Get a list of all deal pipelines.", paged by its
   * documented body `page`: {"size":{"type":"number","default":20},"number":{"type":"number","default":1}}
   * (https://developer.focus.teamleader.eu/docs/api/deal-pipelines-list).
   * No maximum size is documented, so the caller's limit is sent as is.
   *
   * Each pipeline's stages come from POST /dealPhases.list with the documented
   * `filter.deal_pipeline_id`, "sorted by their order in the flow"
   * (https://developer.focus.teamleader.eu/docs/api/deal-phases-list), walked
   * page by page until a short page so no phase is dropped.
   *
   * `meta.matches` is read when present ("Only included with request parameter
   * `includes=pagination`"); that parameter is not in this endpoint's request
   * schema, so it is not sent.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const { page, pageSize } = this.pageParams(params)
    const client = this.client(credentials)
    const res = await client.action<{
      data?: RawTeamleaderDealPipeline[]
      meta?: { matches?: number }
    }>('dealPipelines.list', { page: { size: pageSize, number: page } })
    const rows = res.data ?? []
    if (typeof res.meta?.matches === 'number') {
      reportUpstreamPage(params, { totalCount: res.meta.matches })
    }
    const out: Pipeline[] = []
    for (const row of rows) {
      out.push(transformPipeline(row, await this.listPhases(client, row.id)))
    }
    return out
  }

  /** Every phase of one pipeline, in flow order, walked to a short page. */
  private async listPhases(
    client: TeamleaderClient,
    pipelineId: string,
  ): Promise<RawTeamleaderDealPhase[]> {
    const phases: RawTeamleaderDealPhase[] = []
    for (let number = 1; ; number++) {
      const res = await client.action<{ data?: RawTeamleaderDealPhase[] }>('dealPhases.list', {
        filter: { deal_pipeline_id: pipelineId },
        page: { size: PHASE_PAGE_SIZE, number },
      })
      const rows = res.data ?? []
      phases.push(...rows)
      if (rows.length < PHASE_PAGE_SIZE) return phases
    }
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawTeamleaderActivity>(
      'timeTracking.list',
      this.pageParams(params),
    )
    return items.map(transformActivity)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).action<{ data: { id: string } }>(
      'timeTracking.add',
      body,
    )
    const infoRes = await this.client(credentials).action<{ data: RawTeamleaderActivity }>(
      'timeTracking.info',
      { id: res.data.id },
    )
    return transformActivity(infoRes.data)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawTeamleaderNote>(
      'notes.list',
      this.pageParams(params),
    )
    return items.map(transformNote)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).action<{ data: { id: string } }>('notes.add', body)
    const infoRes = await this.client(credentials).action<{ data: RawTeamleaderNote }>(
      'notes.info',
      { id: res.data.id },
    )
    return transformNote(infoRes.data)
  }
}
