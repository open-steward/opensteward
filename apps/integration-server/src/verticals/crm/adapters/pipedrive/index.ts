/**
 * Pipedrive adapter — reference implementation for the CRM vertical.
 *
 * Reads persons, organizations, deals, pipelines, stages and activities from
 * Pipedrive API v2 (https://developers.pipedrive.com/docs/api/v2/openapi.yaml).
 * Their v1 endpoints are out of support: "The API v1 endpoints announced for
 * deprecation in one of our previous changelog are now in an out-of-support
 * state." (https://developers.pipedrive.com/changelog/post/deprecated-apiv1-endpoints-become-out-of-support,
 * effective Aug 1st, 2026). Notes have no v2 endpoint and stay on v1. The
 * write methods still call v1 and are not migrated here.
 *
 * Auth: an OAuth access token goes in `Authorization: Bearer`, a static API
 * token in the `x-api-token` header (see `client.ts`).
 */

import crypto from 'node:crypto'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { apiHost, PipedriveClient } from './client'
import {
  transformContact,
  transformContactV2,
  untransformContact,
  type RawPipedriveContact,
  type RawPipedriveV2Person,
} from './transform/contact'
import {
  transformCompany,
  transformCompanyV2,
  untransformCompany,
  type RawPipedriveCompany,
  type RawPipedriveV2Organization,
} from './transform/company'
import {
  transformDeal,
  transformDealV2,
  untransformDeal,
  type RawPipedriveDeal,
  type RawPipedriveV2Deal,
} from './transform/deal'
import {
  transformPipeline,
  type RawPipedrivePipeline,
  type RawPipedriveStage,
} from './transform/pipeline'
import {
  transformActivity,
  transformActivityV2,
  untransformActivity,
  type RawPipedriveActivity,
  type RawPipedriveV2Activity,
} from './transform/activity'
import { transformNote, untransformNote, type RawPipedriveNote } from './transform/note'

export interface PipedriveAdapterConfig {
  /** OAuth2 client id (required for Authorization Code flow). */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /**
   * Static API token. If set, the adapter skips OAuth and uses this token
   * for every request. Useful for personal-use integrations.
   */
  apiToken?: string
}

const OAUTH_AUTH_URL = 'https://oauth.pipedrive.com/oauth/authorize'
const OAUTH_TOKEN_URL = 'https://oauth.pipedrive.com/oauth/token'

/**
 * "The maximum limit value is 500." — https://pipedrive.readme.io/docs/core-api-concepts-pagination.
 * Every v2 list's `limit` says the same: "Please note that a maximum value of
 * 500 is allowed."
 */
const MAX_PAGE_SIZE = 500
/** "If not provided, 100 items will be returned." — sent when a direct caller names no limit. */
const DEFAULT_PAGE_SIZE = 100

/** The caller's limit, clamped to 1..500; 100 when it names none. */
function pageSize(params: QueryParams): number {
  const asked = Number(params.limit)
  if (params.limit === undefined || !Number.isFinite(asked) || asked < 1) return DEFAULT_PAGE_SIZE
  return Math.min(Math.floor(asked), MAX_PAGE_SIZE)
}

/** Report `pageSize` only when it is below the caller's ask (a clamp to 500). */
function clampReport(params: QueryParams, size: number): { pageSize?: number } {
  const asked = Number(params.limit)
  return Number.isFinite(asked) && size < asked ? { pageSize: size } : {}
}

/**
 * `updated_since`: "If set, only <entities> with an `update_time` later than
 * or equal to this time are returned. In RFC3339 format, e.g.
 * 2025-01-01T10:20:00Z." Sent to the second, like the example; flooring keeps
 * the bound inclusive.
 */
function updatedSince(params: QueryParams): { updated_since?: string } {
  const d = params.updatedAfter
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return {}
  return { updated_since: d.toISOString().replace(/\.\d{3}Z$/, 'Z') }
}

export class PipedriveAdapter implements CrmAdapter {
  readonly platform = 'pipedrive'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private staticApiToken: string | undefined

  constructor(config: PipedriveAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.staticApiToken = config.apiToken
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    if (this.staticApiToken) {
      // API-token mode: auth URL is not used
      return `https://app.pipedrive.com/settings/api?state=${state}`
    }
    const url = new URL(OAUTH_AUTH_URL)
    url.searchParams.set('client_id', this.clientId ?? '')
    url.searchParams.set('state', state)
    url.searchParams.set('redirect_uri', this.redirectUri ?? '')
    return url.toString()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (this.staticApiToken) {
      return { accessToken: this.staticApiToken }
    }
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Pipedrive exchangeCode: clientId and clientSecret required')
    }
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Pipedrive token exchange failed: ${text}`)
    }
    const json = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
      /** "The base URL path, including the `company_domain`, where the requests can be sent to." */
      api_domain?: string
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
      ...(json.api_domain ? { extra: { apiDomain: json.api_domain } } : {}),
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (this.staticApiToken || !credentials.refreshToken) {
      return credentials
    }
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Pipedrive refreshCredentials: clientId and clientSecret required')
    }
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
      }).toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Pipedrive token refresh failed: ${text}`)
    }
    const json = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
      /** "The base URL path, including the `company_domain`, where the requests can be sent to." */
      api_domain?: string
    }
    const extra = json.api_domain
      ? { ...credentials.extra, apiDomain: json.api_domain }
      : credentials.extra
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? credentials.refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
      ...(extra ? { extra } : {}),
    }
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    // Pipedrive webhooks support Basic auth — compare against configured secret
    const authHeader = headers['authorization'] ?? ''
    const encoded = Buffer.from(secret).toString('base64')
    try {
      return crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(`Basic ${encoded}`))
    } catch {
      return false
    }
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return [
      {
        platform: this.platform,
        type: String(payload['event'] ?? 'unknown'),
        resourceType: String(payload['object'] ?? 'unknown') as WebhookEvent['resourceType'],
        action: 'unknown',
        resourceId: String(
          (payload['current'] as Record<string, unknown> | undefined)?.['id'] ?? 'unknown',
        ),
        payload,
      },
    ]
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** The static API token when configured, else the connection's own credentials. */
  private effective(credentials: Credentials): Credentials {
    return this.staticApiToken ? { accessToken: this.staticApiToken } : credentials
  }

  private client(credentials: Credentials): PipedriveClient {
    return new PipedriveClient(
      this.effective(credentials),
      this.staticApiToken ? 'api_token' : 'oauth',
    )
  }

  /**
   * The caller's page of a v2 list. "Cursor-based endpoints accept the cursor
   * and limit query parameters" (https://pipedrive.readme.io/docs/core-api-concepts-pagination),
   * so page N is reached by walking `next_cursor` from page 1, memoised per
   * connection, collection and filter set. The end is the platform's own:
   * `next_cursor` "will be `null` if you have reached the end of the dataset".
   */
  private async listV2Page<T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    filters: Record<string, unknown> = {},
  ): Promise<T[]> {
    const size = pageSize(params)
    const query = { ...filters, limit: size }
    const eff = this.effective(credentials)
    const key = cursorPagerKey(connectionScope(apiHost(eff), eff), path, query)
    const client = this.client(credentials)
    const { items, hasMore } = await pageByCursor<T>(key, params.page, async (cursor) => {
      const res = await client.listV2<T>(path, { ...query, cursor })
      return { items: res.items, next: res.nextCursor }
    })
    reportUpstreamPage(params, { hasMore, ...clampReport(params, size) })
    return items
  }

  /**
   * Every stage, or every stage of one pipeline (`pipeline_id`: "The ID of the
   * pipeline to fetch stages for. If omitted, stages for all pipelines will be
   * fetched."), walked at the 500 maximum until `next_cursor` is null.
   *
   * Sorted by `order_nr` (`sort_by`: "The field to sort by. Supported fields:
   * `id`, `update_time`, `add_time`, `order_nr`.", default `id`;
   * `sort_direction` defaults to `asc`), so each pipeline's stages come back
   * in stage order, as the canonical `stages` ("Ordered list of stages") needs.
   */
  private async allStages(
    credentials: Credentials,
    pipelineId?: string,
  ): Promise<RawPipedriveStage[]> {
    const client = this.client(credentials)
    const out: RawPipedriveStage[] = []
    const seen = new Set<string>()
    let cursor: string | undefined
    for (;;) {
      const res = await client.listV2<RawPipedriveStage>('/stages', {
        ...(pipelineId !== undefined ? { pipeline_id: pipelineId } : {}),
        sort_by: 'order_nr',
        limit: MAX_PAGE_SIZE,
        cursor,
      })
      out.push(...res.items)
      if (res.nextCursor === undefined) return out
      if (seen.has(res.nextCursor)) {
        throw new Error('Pipedrive /api/v2/stages returned a cursor it had already returned')
      }
      seen.add(res.nextCursor)
      cursor = res.nextCursor
    }
  }

  // ── Contacts (Persons) ────────────────────────────────────────────────────

  /** GET /api/v2/persons (getPersons). */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.listV2Page<RawPipedriveV2Person>(
      credentials,
      params,
      '/persons',
      updatedSince(params),
    )
    return rows.map(transformContactV2)
  }

  /** GET /api/v2/persons/{id} (getPerson). */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).getV2<RawPipedriveV2Person>(
      `/persons/${encodeURIComponent(id)}`,
    )
    return transformContactV2(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    if (!body.name && (data.first_name || data.last_name)) {
      body.name = [data.first_name, data.last_name].filter(Boolean).join(' ')
    }
    const raw = await this.client(credentials).post<RawPipedriveContact>('/persons', body)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawPipedriveContact>(
      `/persons/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/persons/${id}`)
  }

  // ── Companies (Organizations) ─────────────────────────────────────────────

  /** GET /api/v2/organizations (getOrganizations). */
  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const rows = await this.listV2Page<RawPipedriveV2Organization>(
      credentials,
      params,
      '/organizations',
      updatedSince(params),
    )
    return rows.map(transformCompanyV2)
  }

  /** GET /api/v2/organizations/{id} (getOrganization). */
  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).getV2<RawPipedriveV2Organization>(
      `/organizations/${encodeURIComponent(id)}`,
    )
    return transformCompanyV2(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawPipedriveCompany>(
      '/organizations',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawPipedriveCompany>(
      `/organizations/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/organizations/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  /**
   * GET /api/v2/deals (getDeals). Without `status`, "all not deleted deals are
   * returned".
   */
  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const rows = await this.listV2Page<RawPipedriveV2Deal>(
      credentials,
      params,
      '/deals',
      updatedSince(params),
    )
    return rows.map(transformDealV2)
  }

  /** GET /api/v2/deals/{id} (getDeal). */
  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).getV2<RawPipedriveV2Deal>(
      `/deals/${encodeURIComponent(id)}`,
    )
    return transformDealV2(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawPipedriveDeal>(
      '/deals',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawPipedriveDeal>(
      `/deals/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * The caller's page of GET /api/v2/pipelines (getPipelines), each with its
   * stages. A v2 pipeline carries no stages, so they come from every page of
   * GET /api/v2/stages, grouped by each stage's `pipeline_id`. The pipelines
   * page decides `hasMore`; the stage walk always runs to its end.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const pipelines = await this.listV2Page<RawPipedrivePipeline>(credentials, params, '/pipelines')
    if (pipelines.length === 0) return []
    const stages = await this.allStages(credentials)
    return pipelines.map((p) =>
      transformPipeline(
        p,
        stages.filter((s) => s.pipeline_id === p.id),
      ),
    )
  }

  /** GET /api/v2/pipelines/{id} (getPipeline), plus every stage with its `pipeline_id`. */
  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).getV2<RawPipedrivePipeline>(
      `/pipelines/${encodeURIComponent(id)}`,
    )
    const stages = await this.allStages(credentials, id)
    return transformPipeline(raw, stages)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  /** GET /api/v2/activities (getActivities). */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const rows = await this.listV2Page<RawPipedriveV2Activity>(
      credentials,
      params,
      '/activities',
      updatedSince(params),
    )
    return rows.map(transformActivityV2)
  }

  /** GET /api/v2/activities/{id} (getActivity). */
  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).getV2<RawPipedriveV2Activity>(
      `/activities/${encodeURIComponent(id)}`,
    )
    return transformActivityV2(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    // Pipedrive requires subject and due_date at minimum
    if (!body.subject) body.subject = 'Activity'
    if (!body.type) body.type = 'task'
    const raw = await this.client(credentials).post<RawPipedriveActivity>('/activities', body)
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).put<RawPipedriveActivity>(
      `/activities/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/activities/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    // v1 /notes pages by `start` + `limit` (max 500) and answers
    // additional_data.pagination.more_items_in_collection.
    const limit = pageSize(params)
    const { items, hasMore } = await this.client(credentials).list<RawPipedriveNote>('/notes', {
      start: pageOffset(params, limit),
      limit,
    })
    reportUpstreamPage(
      params,
      hasMore === undefined ? { pageSize: limit } : { hasMore, pageSize: limit },
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawPipedriveNote>(`/notes/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawPipedriveNote>(
      '/notes',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).put<RawPipedriveNote>(
      `/notes/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
