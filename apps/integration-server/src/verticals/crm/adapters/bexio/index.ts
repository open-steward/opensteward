/**
 * Bexio adapter for the CRM vertical.
 *
 * Maps the Bexio REST API to canonical CRM resources.
 * Docs: https://docs.bexio.com
 *
 * Auth: OAuth2 (authorization code flow)
 * Notable:
 *   - Swiss business software with CRM, invoicing, and accounting
 *   - Contacts API unifies persons (contact_type_id=2) and companies (contact_type_id=1)
 *   - No native deal/pipeline entity; uses quotes (kb_offer) as deal proxy
 *   - Tasks used as activities
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (19):
 *   Contacts (Persons): list, get, create, update, delete
 *   Companies (Contact type=1): list, get, create, update, delete
 *   Deals (Quotes): list, get, create, update, delete
 *   Pipelines: list (returns empty — no native pipelines)
 *   Activities (Tasks): list, get, create
 *   Notes: list, get, create
 *   Auth: getAuthUrl, exchangeCode, refreshCredentials
 *   Webhooks: verifyWebhook (stub), parseWebhookEvents (stub)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { BexioClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import {
  OAUTH_AUTH_URL,
  OAUTH_TOKEN_URL,
  DEFAULT_PAGE_SIZE,
  CONTACT_TYPE_PERSON,
  CONTACT_TYPE_COMPANY,
} from './constants'
import { transformContact, untransformContact, type RawBexioContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawBexioCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawBexioQuote } from './transform/deal'
import { transformActivity, untransformActivity, type RawBexioTask } from './transform/activity'
import { transformNote, untransformNote, type RawBexioNote } from './transform/note'

export interface BexioAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class BexioAdapter implements CrmAdapter {
  readonly platform = 'bexio'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: BexioAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const url = new URL(OAUTH_AUTH_URL)
    url.searchParams.set('client_id', this.clientId ?? '')
    url.searchParams.set('redirect_uri', this.redirectUri ?? '')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', state)
    url.searchParams.set('scope', (overrideScopes ?? ['contact_show', 'contact_edit', 'general']).join(' '))
    return url.toString()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Bexio: clientId and clientSecret required')
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
      throw new Error(`Bexio token exchange failed: ${text}`)
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
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): BexioClient {
    return new BexioClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    const offset = (page - 1) * limit
    return { limit, offset }
  }

  // ── Contacts (Persons, contact_type_id=2) ─────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const listP = this.listParams(params)
    const { items } = await this.client(credentials).list<RawBexioContact>(
      '/2.0/contact',
      { ...listP, contact_type_id: CONTACT_TYPE_PERSON },
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawBexioContact>(`/2.0/contact/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawBexioContact>('/2.0/contact', body)
    return transformContact(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawBexioContact>(`/2.0/contact/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/2.0/contact/${id}`)
  }

  // ── Companies (contact_type_id=1) ─────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const listP = this.listParams(params)
    const { items } = await this.client(credentials).list<RawBexioCompany>(
      '/2.0/contact',
      { ...listP, contact_type_id: CONTACT_TYPE_COMPANY },
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawBexioCompany>(`/2.0/contact/${id}`)
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawBexioCompany>('/2.0/contact', body)
    return transformCompany(res)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawBexioCompany>(`/2.0/contact/${id}`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/2.0/contact/${id}`)
  }

  // ── Deals (Quotes as proxy) ───────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawBexioQuote>(
      '/2.0/kb_offer',
      this.listParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<RawBexioQuote>(`/2.0/kb_offer/${id}`)
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawBexioQuote>('/2.0/kb_offer', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawBexioQuote>(`/2.0/kb_offer/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/2.0/kb_offer/${id}`)
  }

  // ── Pipelines (no native concept in Bexio) ───────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    return []
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawBexioTask>(
      '/2.0/task',
      this.listParams(params),
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawBexioTask>(`/2.0/task/${id}`)
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawBexioTask>('/2.0/task', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawBexioNote>(
      '/2.0/note',
      this.listParams(params),
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<RawBexioNote>(`/2.0/note/${id}`)
    return transformNote(res)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawBexioNote>('/2.0/note', body)
    return transformNote(res)
  }
}
