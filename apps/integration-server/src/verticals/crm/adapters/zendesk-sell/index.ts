/**
 * Zendesk Sell adapter for the CRM vertical.
 *
 * Maps the Zendesk Sell (formerly Base CRM) REST API v2 to canonical CRM
 * resources. Uses OAuth2 Authorization Code flow for authentication.
 * All contacts and organizations share the `/contacts` endpoint, distinguished
 * by `is_organization`. Tasks map to Activities; Notes use `/notes`.
 *
 * Docs: https://developer.zendesk.com/api-reference/sales-crm/introduction/
 * Base URL: https://api.getbase.com/v2
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { ZendeskSellClient } from './client'
import { ZENDESK_SELL_OAUTH_AUTH_URL, ZENDESK_SELL_OAUTH_TOKEN_URL, ZENDESK_SELL_PAGE_SIZE } from './constants'
import { verifyZendeskSellWebhook, parseZendeskSellWebhookEvents } from './webhook'
import {
  transformContact, untransformContact, type RawZendeskSellContact,
} from './transform/contact'
import {
  transformCompany, untransformCompany, type RawZendeskSellCompany,
} from './transform/company'
import {
  transformDeal, untransformDeal, type RawZendeskSellDeal,
} from './transform/deal'
import {
  transformPipeline, type RawZendeskSellPipeline, type RawZendeskSellStage,
} from './transform/pipeline'
import {
  transformActivity, untransformActivity, type RawZendeskSellTask,
} from './transform/activity'
import {
  transformNote, untransformNote, type RawZendeskSellNote,
} from './transform/note'

export interface ZendeskSellAdapterConfig {
  /** OAuth2 client ID — read from `credentials.extra.clientId` at runtime. */
  clientId?: string
  /** OAuth2 client secret — read from `credentials.extra.clientSecret` at runtime. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
}

export class ZendeskSellAdapter implements CrmAdapter {
  readonly platform = 'zendesk-sell'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: ZendeskSellAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const url = new URL(ZENDESK_SELL_OAUTH_AUTH_URL)
    url.searchParams.set('client_id', this.clientId ?? '')
    url.searchParams.set('redirect_uri', this.redirectUri ?? '')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', state)
    return url.toString()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('ZendeskSell exchangeCode: clientId and clientSecret required')
    }
    const res = await fetch(ZENDESK_SELL_OAUTH_TOKEN_URL, {
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
      throw new Error(`ZendeskSell token exchange failed: ${text}`)
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
    const clientId = (credentials.extra?.['clientId'] as string | undefined) ?? this.clientId
    const clientSecret = (credentials.extra?.['clientSecret'] as string | undefined) ?? this.clientSecret
    if (!clientId || !clientSecret) return credentials
    const res = await fetch(ZENDESK_SELL_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: credentials.refreshToken,
      }).toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`ZendeskSell token refresh failed: ${text}`)
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

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyZendeskSellWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseZendeskSellWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): ZendeskSellClient {
    return new ZendeskSellClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const page = params['page'] ?? 1
    return {
      page,
      per_page: params.limit ?? ZENDESK_SELL_PAGE_SIZE,
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawZendeskSellContact>(
      '/contacts',
      { ...this.pageParams(params), is_organization: false },
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawZendeskSellContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawZendeskSellContact>(
      '/contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawZendeskSellContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (Organizations) ─────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawZendeskSellCompany>(
      '/contacts',
      { ...this.pageParams(params), is_organization: true },
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawZendeskSellCompany>(`/contacts/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawZendeskSellCompany>(
      '/contacts',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawZendeskSellCompany>(
      `/contacts/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawZendeskSellDeal>(
      '/deals',
      this.pageParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawZendeskSellDeal>(`/deals/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawZendeskSellDeal>(
      '/deals',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).put<RawZendeskSellDeal>(
      `/deals/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const { items: pipelines } = await this.client(credentials).list<RawZendeskSellPipeline>(
      '/pipelines',
      this.pageParams(params),
    )
    // Fetch all stages in parallel per pipeline
    const results = await Promise.all(
      pipelines.map(async (p) => {
        const { items: stages } = await this.client(credentials).list<RawZendeskSellStage>(
          '/stages',
          { pipeline_id: p.id, per_page: 100 },
        )
        return transformPipeline(p, stages)
      }),
    )
    return results
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawZendeskSellPipeline>(`/pipelines/${id}`)
    const { items: stages } = await this.client(credentials).list<RawZendeskSellStage>(
      '/stages',
      { pipeline_id: id, per_page: 100 },
    )
    return transformPipeline(raw, stages)
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawZendeskSellTask>(
      '/tasks',
      this.pageParams(params),
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawZendeskSellTask>(`/tasks/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawZendeskSellTask>(
      '/tasks',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).put<RawZendeskSellTask>(
      `/tasks/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/tasks/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawZendeskSellNote>(
      '/notes',
      this.pageParams(params),
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawZendeskSellNote>(`/notes/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawZendeskSellNote>(
      '/notes',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(
    credentials: Credentials,
    id: string,
    data: Partial<Note>,
  ): Promise<Note> {
    const raw = await this.client(credentials).put<RawZendeskSellNote>(
      `/notes/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
