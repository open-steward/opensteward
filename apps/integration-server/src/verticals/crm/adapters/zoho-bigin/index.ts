/**
 * Zoho Bigin adapter for the CRM vertical.
 *
 * Maps the Zoho Bigin REST API v2 to canonical CRM resources.
 * Docs: https://www.zoho.com/bigin/developer/docs/api/
 *
 * Auth: Zoho OAuth2 (same flow as zoho-crm, different base URL + scopes)
 * Base URL: https://www.zohoapis.com/bigin/v2
 */

import { pageLocally } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { ZohoBiginClient } from './client'
import { ZOHO_AUTH_URL, ZOHO_TOKEN_URL, DEFAULT_BIGIN_SCOPES } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawBiginContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawBiginAccount } from './transform/company'
import { transformDeal, untransformDeal, type RawBiginDeal } from './transform/deal'
import { transformPipeline, type RawBiginLayout } from './transform/pipeline'
import { transformActivity, untransformActivity, type RawBiginActivity } from './transform/activity'
import { transformNote, untransformNote, type RawBiginNote } from './transform/note'

const ACTIVITIES_UNSUPPORTED =
  'Zoho Bigin has no Activities module (Get Records documents Contacts, Pipelines, ' +
  'Accounts, Products, Tasks, Events and Calls); activities live in the separate Tasks, ' +
  'Events and Calls modules, which this adapter does not map yet'

export interface ZohoBiginAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class ZohoBiginAdapter implements CrmAdapter {
  readonly platform = 'zoho-bigin'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: ZohoBiginAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const url = new URL(ZOHO_AUTH_URL)
    url.searchParams.set('client_id', this.clientId ?? '')
    url.searchParams.set('redirect_uri', this.redirectUri ?? '')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', (overrideScopes ?? DEFAULT_BIGIN_SCOPES).join(','))
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('state', state)
    return url.toString()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Zoho Bigin: clientId and clientSecret required')
    }
    const res = await fetch(ZOHO_TOKEN_URL, {
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
      throw new Error(`Zoho Bigin token exchange failed: ${text}`)
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
    const extra = credentials.extra as Record<string, string> | undefined
    const clientId = this.clientId ?? extra?.['clientId'] ?? ''
    const clientSecret = this.clientSecret ?? extra?.['clientSecret'] ?? ''
    const res = await fetch(ZOHO_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: credentials.refreshToken,
      }).toString(),
    })
    if (!res.ok) return credentials
    const json = (await res.json()) as { access_token: string; expires_in?: number }
    return {
      ...credentials,
      accessToken: json.access_token,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    }
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private c(creds: Credentials): ZohoBiginClient {
    return new ZohoBiginClient(creds)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params['page'] ?? 1,
      per_page: params['limit'] ?? 25,
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.c(credentials).list<RawBiginContact>(
      'Contacts',
      this.pageParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.c(credentials).get<RawBiginContact>('Contacts', id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.c(credentials).post<RawBiginContact>(
      'Contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.c(credentials).put<RawBiginContact>(
      'Contacts',
      id,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete('Contacts', id)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.c(credentials).list<RawBiginAccount>(
      'Accounts',
      this.pageParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.c(credentials).get<RawBiginAccount>('Accounts', id)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.c(credentials).post<RawBiginAccount>(
      'Accounts',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.c(credentials).put<RawBiginAccount>(
      'Accounts',
      id,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete('Accounts', id)
  }

  // ── Deals (Pipelines module) ───────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.c(credentials).list<RawBiginDeal>(
      'Pipelines',
      this.pageParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.c(credentials).get<RawBiginDeal>('Pipelines', id)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).post<RawBiginDeal>('Pipelines', untransformDeal(data))
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).put<RawBiginDeal>('Pipelines', id, untransformDeal(data))
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete('Pipelines', id)
  }

  // ── Pipelines (Team Pipelines = layouts of the Pipelines module) ──────────
  //
  // Bigin documents no /settings/pipeline endpoint. A Team Pipeline is a
  // layout of the Pipelines module, and GET /settings/layouts?module=Pipelines
  // returns all of them in one unpaged response
  // (https://www.bigin.com/developer/docs/apis/v2/layouts-meta-data.html), so
  // the caller's page is cut locally. There is no layout-by-id endpoint, so
  // getPipeline reads the same list.

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const layouts = await this.c(credentials).layouts<RawBiginLayout>('Pipelines')
    return pageLocally(layouts.map(transformPipeline), params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const layouts = await this.c(credentials).layouts<RawBiginLayout>('Pipelines')
    const raw = layouts.find((l) => String(l.id) === id)
    if (!raw) {
      throw Object.assign(new Error(`Zoho Bigin: not found — Team Pipeline ${id}`), {
        statusCode: 404,
      })
    }
    return transformPipeline(raw)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  // Bigin has no Activities module. The documented Get Records modules are
  // Contacts, Pipelines, Accounts, Products, Tasks, Events and Calls
  // (https://www.bigin.com/developer/docs/apis/v2/get-records.html), so
  // GET /Activities and /Activities/{id} are refused before any request.

  async listActivities(_credentials: Credentials, _params: QueryParams): Promise<Activity[]> {
    throw Object.assign(new Error(ACTIVITIES_UNSUPPORTED), {
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
  }

  async getActivity(_credentials: Credentials, _id: string): Promise<Activity> {
    throw Object.assign(new Error(ACTIVITIES_UNSUPPORTED), {
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.c(credentials).post<RawBiginActivity>(
      'Activities',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.c(credentials).put<RawBiginActivity>(
      'Activities',
      id,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete('Activities', id)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.c(credentials).list<RawBiginNote>('Notes', this.pageParams(params))
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.c(credentials).get<RawBiginNote>('Notes', id)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).post<RawBiginNote>('Notes', untransformNote(data))
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).put<RawBiginNote>('Notes', id, untransformNote(data))
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete('Notes', id)
  }
}
