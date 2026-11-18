/**
 * Daylite adapter — CRM resource coverage for the OpenSteward CRM vertical.
 *
 * Maps the Daylite REST API (api.marketcircle.net/v1) to canonical CRM
 * resources: contacts, companies, deals (opportunities), pipelines, tasks
 * (activities), and notes.
 *
 * All CRUD operations are supported for contacts, companies, deals, tasks,
 * and notes. Pipelines are read-only (admin-managed in Daylite).
 *
 * List endpoints are unpaginated (whole collection per GET), so list methods
 * page locally with pageLocally(). Auth uses OAuth2 Bearer tokens
 * issued by www.marketcircle.com/account/oauth.
 *
 * Docs: https://developer.daylite.app/reference/getting-started
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { pageLocally } from '@opensteward/shared'
import { DayliteClient } from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshToken as doRefreshToken,
} from './auth'
import { verifyDayliteWebhook, parseDayliteWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawDayliteContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawDayliteCompany,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawDayliteOpportunity,
} from './transform/deal'
import { transformPipeline, type RawDaylitePipeline } from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawDayliteTask,
} from './transform/activity'
import {
  transformNote,
  untransformNote,
  type RawDayliteNote,
} from './transform/note'
import { DEFAULT_DAYLITE_SCOPES } from './constants'

export interface DayliteAdapterConfig {
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** OAuth scopes to request. Defaults to DEFAULT_DAYLITE_SCOPES when omitted. */
  scopes?: string[]
}

export class DayliteAdapter implements CrmAdapter {
  readonly platform = 'daylite'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]

  constructor(config: DayliteAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? [...DEFAULT_DAYLITE_SCOPES]
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      {
        clientId: this.clientId ?? '',
        clientSecret: this.clientSecret ?? '',
        redirectUri: this.redirectUri ?? '',
        scopes: overrideScopes ?? this.scopes,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Daylite exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode(
      { clientId: this.clientId, clientSecret: this.clientSecret, redirectUri },
      code,
      redirectUri,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const clientId =
      this.clientId ??
      (credentials.extra as Record<string, string> | undefined)?.['clientId'] ??
      ''
    const clientSecret =
      this.clientSecret ??
      (credentials.extra as Record<string, string> | undefined)?.['clientSecret'] ??
      ''
    return doRefreshToken({ clientId, clientSecret }, credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(
    payload: Buffer,
    headers: Record<string, string>,
    secret: string,
  ): boolean {
    return verifyDayliteWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseDayliteWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): DayliteClient {
    return new DayliteClient(credentials)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Contact[]> {
    const rows = await this.client(credentials).list<RawDayliteContact>('/contacts')
    return pageLocally(rows, params).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawDayliteContact>(
      `/contacts/${id}`,
    )
    return transformContact(raw)
  }

  async createContact(
    credentials: Credentials,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).post<RawDayliteContact>(
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
    const raw = await this.client(credentials).put<RawDayliteContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Company[]> {
    const rows = await this.client(credentials).list<RawDayliteCompany>('/companies')
    return pageLocally(rows, params).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawDayliteCompany>(
      `/companies/${id}`,
    )
    return transformCompany(raw)
  }

  async createCompany(
    credentials: Credentials,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).post<RawDayliteCompany>(
      '/companies',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawDayliteCompany>(
      `/companies/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals (Opportunities) ──────────────────────────────────────────────────

  async listDeals(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Deal[]> {
    const rows = await this.client(credentials).list<RawDayliteOpportunity>('/opportunities')
    return pageLocally(rows, params).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawDayliteOpportunity>(
      `/opportunities/${id}`,
    )
    return transformDeal(raw)
  }

  async createDeal(
    credentials: Credentials,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).post<RawDayliteOpportunity>(
      '/opportunities',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).put<RawDayliteOpportunity>(
      `/opportunities/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines (read-only) ──────────────────────────────────────────────────

  async listPipelines(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Pipeline[]> {
    const rows = await this.client(credentials).list<RawDaylitePipeline>('/pipelines')
    return pageLocally(rows, params).map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawDaylitePipeline>(
      `/pipelines/${id}`,
    )
    return transformPipeline(raw)
  }

  // ── Activities (Tasks) ─────────────────────────────────────────────────────

  async listActivities(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Activity[]> {
    const rows = await this.client(credentials).list<RawDayliteTask>('/tasks')
    return pageLocally(rows, params).map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawDayliteTask>(
      `/tasks/${id}`,
    )
    return transformActivity(raw)
  }

  async createActivity(
    credentials: Credentials,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).post<RawDayliteTask>(
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
    const raw = await this.client(credentials).put<RawDayliteTask>(
      `/tasks/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/tasks/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Note[]> {
    const rows = await this.client(credentials).list<RawDayliteNote>('/notes')
    return pageLocally(rows, params).map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawDayliteNote>(
      `/notes/${id}`,
    )
    return transformNote(raw)
  }

  async createNote(
    credentials: Credentials,
    data: Partial<Note>,
  ): Promise<Note> {
    const raw = await this.client(credentials).post<RawDayliteNote>(
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
    const raw = await this.client(credentials).put<RawDayliteNote>(
      `/notes/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
