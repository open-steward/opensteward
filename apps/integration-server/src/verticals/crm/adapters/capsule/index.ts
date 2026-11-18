/**
 * Capsule CRM adapter for the CRM vertical.
 *
 * Maps the Capsule REST API v2 to canonical CRM resources.
 * Docs: https://developer.capsulecrm.com/
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (22):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete
 *   Pipelines:  list (each pipeline with its milestones as stages)
 *   Activities: list, get, create, update, delete
 *   Notes:      list, get, create, delete
 *   Auth:       getAuthUrl, exchangeCode, refreshCredentials
 *   Webhooks:   verifyWebhook, parseWebhookEvents
 *
 * Notes:
 *   - Capsule uses a "Parties" model: contacts (type=person) and companies
 *     (type=organisation) share the same /parties endpoint.
 *   - An account can hold several pipelines; each pipeline's milestones are
 *     its stages (GET /pipelines, then GET /pipelines/{id}/milestones).
 *   - Notes are a subtype of "Entries" (/entries?type=note).
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { reportUpstreamPage } from '@opensteward/shared'
import { CapsuleClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawCapsuleContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawCapsuleCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawCapsuleDeal } from './transform/deal'
import {
  transformPipeline,
  type RawCapsuleMilestone,
  type RawCapsulePipeline,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawCapsuleActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawCapsuleNote } from './transform/note'

const OAUTH_AUTH_URL = 'https://api.capsulecrm.com/oauth/authorise'
const OAUTH_TOKEN_URL = 'https://api.capsulecrm.com/oauth/token'

/**
 * https://developer.capsulecrm.com/v2/overview/reading-from-the-api:
 * "You can also set a custom page size up to 100 with the ?perPage parameter."
 */
const MAX_PAGE_SIZE = 100

export interface CapsuleAdapterConfig {
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
}

export class CapsuleAdapter implements CrmAdapter {
  readonly platform = 'capsule'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: CapsuleAdapterConfig = {}) {
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
      throw new Error('Capsule exchangeCode: clientId and clientSecret required')
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
      throw new Error(`Capsule token exchange failed: ${text}`)
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
      throw new Error(`Capsule token refresh failed: ${text}`)
    }
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

  private client(credentials: Credentials): CapsuleClient {
    return new CapsuleClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params['page'] ?? 1,
      perPage: params['limit'] ?? params['perPage'] ?? 25,
    }
  }

  // ── Contacts (Parties where type=person) ──────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawCapsuleContact>(
      'parties',
      '/parties',
      { ...this.listParams(params), type: 'person' },
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<{ party: RawCapsuleContact }>(`/parties/${id}`)
    return transformContact(res.party)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<{ party: RawCapsuleContact }>('/parties', {
      party: body,
    })
    return transformContact(res.party)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<{ party: RawCapsuleContact }>(`/parties/${id}`, {
      party: body,
    })
    return transformContact(res.party)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/parties/${id}`)
  }

  // ── Companies (Parties where type=organisation) ───────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawCapsuleCompany>(
      'parties',
      '/parties',
      { ...this.listParams(params), type: 'organisation' },
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<{ party: RawCapsuleCompany }>(`/parties/${id}`)
    return transformCompany(res.party)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<{ party: RawCapsuleCompany }>('/parties', {
      party: body,
    })
    return transformCompany(res.party)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<{ party: RawCapsuleCompany }>(`/parties/${id}`, {
      party: body,
    })
    return transformCompany(res.party)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/parties/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawCapsuleDeal>(
      'opportunities',
      '/opportunities',
      this.listParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<{ opportunity: RawCapsuleDeal }>(
      `/opportunities/${id}`,
    )
    return transformDeal(res.opportunity)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<{ opportunity: RawCapsuleDeal }>(
      '/opportunities',
      { opportunity: body },
    )
    return transformDeal(res.opportunity)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<{ opportunity: RawCapsuleDeal }>(
      `/opportunities/${id}`,
      { opportunity: body },
    )
    return transformDeal(res.opportunity)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * https://developer.capsulecrm.com/v2/operations/Pipeline — "List pipelines":
   * "The collection of pipelines on the Capsule account."
   * GET https://api.capsulecrm.com/api/v2/pipelines, query `page` ("The page of
   * results to return. Default: 1") and `perPage` ("Value must be between 1 and
   * 100"), body `{ "pipelines": [...] }`, next page signalled by the Link header.
   *
   * The Pipeline model embeds no milestones, so each pipeline's stages come from
   * "List milestones by pipeline": GET /api/v2/pipelines/{pipelineId}/milestones,
   * walked to the end at perPage=100. The legacy GET /milestones covers only
   * "the oldest active pipeline" and is not used.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const client = this.client(credentials)
    const page =
      typeof params.page === 'number' && Number.isFinite(params.page) && params.page >= 1
        ? Math.floor(params.page)
        : 1
    const limit =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : MAX_PAGE_SIZE
    const perPage = Math.min(limit, MAX_PAGE_SIZE)

    const { body, hasNext } = await client.getPage<{ pipelines?: RawCapsulePipeline[] }>(
      '/pipelines',
      { page, perPage },
    )
    reportUpstreamPage(params, {
      hasMore: hasNext,
      ...(perPage < limit ? { pageSize: perPage } : {}),
    })

    const out: Pipeline[] = []
    for (const pipeline of body.pipelines ?? []) {
      out.push(transformPipeline(pipeline, await this.listPipelineMilestones(client, pipeline.id)))
    }
    return out
  }

  /** Every milestone of one pipeline, following rel="next" to the end. */
  private async listPipelineMilestones(
    client: CapsuleClient,
    pipelineId: number,
  ): Promise<RawCapsuleMilestone[]> {
    const all: RawCapsuleMilestone[] = []
    for (let page = 1; ; page++) {
      const { body, hasNext } = await client.getPage<{ milestones?: RawCapsuleMilestone[] }>(
        `/pipelines/${encodeURIComponent(String(pipelineId))}/milestones`,
        { page, perPage: MAX_PAGE_SIZE },
      )
      const rows = body.milestones ?? []
      all.push(...rows)
      if (!hasNext || rows.length === 0) return all
    }
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawCapsuleActivity>(
      'tasks',
      '/tasks',
      this.listParams(params),
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<{ task: RawCapsuleActivity }>(`/tasks/${id}`)
    return transformActivity(res.task)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<{ task: RawCapsuleActivity }>('/tasks', {
      task: body,
    })
    return transformActivity(res.task)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).put<{ task: RawCapsuleActivity }>(`/tasks/${id}`, {
      task: body,
    })
    return transformActivity(res.task)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/tasks/${id}`)
  }

  // ── Notes (Entries with type=note) ────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawCapsuleNote>('entries', '/entries', {
      ...this.listParams(params),
      type: 'note',
    })
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<{ entry: RawCapsuleNote }>(`/entries/${id}`)
    return transformNote(res.entry)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<{ entry: RawCapsuleNote }>('/entries', {
      entry: body,
    })
    return transformNote(res.entry)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/entries/${id}`)
  }
}
