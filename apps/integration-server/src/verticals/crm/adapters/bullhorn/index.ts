/**
 * Bullhorn CRM adapter for the CRM vertical.
 *
 * Maps the Bullhorn REST API to canonical CRM resources.
 * Docs: https://bullhorn.github.io/rest-api-docs/
 *
 * Auth: OAuth2 authorization code + Bullhorn session login
 * Notable:
 *   - Two-step auth: OAuth2 code → access token → BH login endpoint
 *   - Login endpoint returns dynamic restUrl (tenant-specific base URL) + BhRestToken
 *   - BhRestToken is passed as a query param on all subsequent API calls
 *   - restUrl stored in credentials.extra.instanceUrl
 *   - accessToken stores the BhRestToken for API calls
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts (ClientContact): list, get, create, update, delete
 *   Companies (ClientCorporation): list, get, create, update, delete
 *   Deals (JobOrder): list, get, create, update, delete
 *   Pipelines: list (returns [] — not native in Bullhorn)
 *   Activities (Task): list, get, create
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

import { BullhornClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { OAUTH_AUTH_URL, OAUTH_TOKEN_URL, LOGIN_URL, DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawBullhornContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawBullhornCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawBullhornDeal } from './transform/deal'
import { transformActivity, untransformActivity, type RawBullhornActivity } from './transform/activity'
import { transformNote, untransformNote, type RawBullhornNote } from './transform/note'

export interface BullhornAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class BullhornAdapter implements CrmAdapter {
  readonly platform = 'bullhorn'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: BullhornAdapterConfig = {}) {
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
      throw new Error('Bullhorn: clientId and clientSecret required')
    }

    // Step 1: Exchange code for OAuth2 access token
    const tokenRes = await fetch(OAUTH_TOKEN_URL, {
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
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => tokenRes.statusText)
      throw new Error(`Bullhorn token exchange failed: ${text}`)
    }
    const tokenJson = await tokenRes.json() as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }

    // Step 2: Login to get BhRestToken + restUrl
    const loginUrl = new URL(LOGIN_URL)
    loginUrl.searchParams.set('version', '2.0')
    loginUrl.searchParams.set('access_token', tokenJson.access_token)
    const loginRes = await fetch(loginUrl.toString())
    if (!loginRes.ok) {
      const text = await loginRes.text().catch(() => loginRes.statusText)
      throw new Error(`Bullhorn login failed: ${text}`)
    }
    const loginJson = await loginRes.json() as {
      BhRestToken: string
      restUrl: string
    }

    return {
      accessToken: loginJson.BhRestToken,
      refreshToken: tokenJson.refresh_token,
      expiresAt: tokenJson.expires_in
        ? new Date(Date.now() + tokenJson.expires_in * 1000)
        : undefined,
      extra: {
        instanceUrl: loginJson.restUrl,
        oauthAccessToken: tokenJson.access_token,
      },
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Re-login using the stored OAuth refresh token
    if (!credentials.refreshToken || !this.clientId || !this.clientSecret) return credentials

    const tokenRes = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: credentials.refreshToken,
      }).toString(),
    })
    if (!tokenRes.ok) return credentials
    const tokenJson = await tokenRes.json() as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }

    // Re-login to get fresh BhRestToken
    const loginUrl = new URL(LOGIN_URL)
    loginUrl.searchParams.set('version', '2.0')
    loginUrl.searchParams.set('access_token', tokenJson.access_token)
    const loginRes = await fetch(loginUrl.toString())
    if (!loginRes.ok) return credentials
    const loginJson = await loginRes.json() as {
      BhRestToken: string
      restUrl: string
    }

    return {
      ...credentials,
      accessToken: loginJson.BhRestToken,
      refreshToken: tokenJson.refresh_token ?? credentials.refreshToken,
      expiresAt: tokenJson.expires_in
        ? new Date(Date.now() + tokenJson.expires_in * 1000)
        : undefined,
      extra: {
        ...credentials.extra,
        instanceUrl: loginJson.restUrl,
        oauthAccessToken: tokenJson.access_token,
      },
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

  private client(credentials: Credentials): BullhornClient {
    return new BullhornClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const count = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    const start = (page - 1) * count
    return { count, start }
  }

  // ── Contacts (ClientContact) ───────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawBullhornContact>(
      '/entity/ClientContact',
      {
        ...this.listParams(params),
        fields: 'id,firstName,lastName,name,email,phone,mobile,clientCorporation,owner,dateAdded,dateLastModified',
      },
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<{ data: RawBullhornContact }>(
      `/entity/ClientContact/${id}`,
      { fields: 'id,firstName,lastName,name,email,phone,mobile,clientCorporation,owner,dateAdded,dateLastModified' },
    )
    return transformContact(res.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<{ changedEntityId: number }>(
      '/entity/ClientContact',
      body,
    )
    return this.getContact(credentials, String(res.changedEntityId))
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    // Bullhorn REST API uses POST for entity updates, not PUT
    await this.client(credentials).post<unknown>(`/entity/ClientContact/${id}`, body)
    return this.getContact(credentials, id)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/entity/ClientContact/${id}`)
  }

  // ── Companies (ClientCorporation) ─────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawBullhornCompany>(
      '/entity/ClientCorporation',
      {
        ...this.listParams(params),
        fields: 'id,name,phone,owner,dateAdded,dateLastModified',
      },
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<{ data: RawBullhornCompany }>(
      `/entity/ClientCorporation/${id}`,
      { fields: 'id,name,phone,owner,dateAdded,dateLastModified' },
    )
    return transformCompany(res.data)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<{ changedEntityId: number }>(
      '/entity/ClientCorporation',
      body,
    )
    return this.getCompany(credentials, String(res.changedEntityId))
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    // Bullhorn REST API uses POST for entity updates, not PUT
    await this.client(credentials).post<unknown>(`/entity/ClientCorporation/${id}`, body)
    return this.getCompany(credentials, id)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/entity/ClientCorporation/${id}`)
  }

  // ── Deals (JobOrder) ──────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawBullhornDeal>(
      '/entity/JobOrder',
      {
        ...this.listParams(params),
        fields: 'id,title,salary,status,clientCorporation,clientContact,owner,dateEnd,dateAdded,dateLastModified',
      },
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<{ data: RawBullhornDeal }>(
      `/entity/JobOrder/${id}`,
      { fields: 'id,title,salary,status,clientCorporation,clientContact,owner,dateEnd,dateAdded,dateLastModified' },
    )
    return transformDeal(res.data)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<{ changedEntityId: number }>(
      '/entity/JobOrder',
      body,
    )
    return this.getDeal(credentials, String(res.changedEntityId))
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    // Bullhorn REST API uses POST for entity updates, not PUT
    await this.client(credentials).post<unknown>(`/entity/JobOrder/${id}`, body)
    return this.getDeal(credentials, id)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/entity/JobOrder/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────
  // Bullhorn does not have a native pipeline concept

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    return []
  }

  // ── Activities (Task) ─────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawBullhornActivity>(
      '/entity/Task',
      {
        ...this.listParams(params),
        fields: 'id,type,subject,description,isCompleted,dateBegin,dateEnd,clientContact,clientCorporation,jobOrder,owner,dateAdded,dateLastModified',
      },
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<{ data: RawBullhornActivity }>(
      `/entity/Task/${id}`,
      { fields: 'id,type,subject,description,isCompleted,dateBegin,dateEnd,clientContact,clientCorporation,jobOrder,owner,dateAdded,dateLastModified' },
    )
    return transformActivity(res.data)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<{ changedEntityId: number }>(
      '/entity/Task',
      body,
    )
    return this.getActivity(credentials, String(res.changedEntityId))
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawBullhornNote>(
      '/entity/Note',
      {
        ...this.listParams(params),
        fields: 'id,comments,action,clientContact,clientCorporation,jobOrder,personReference,dateAdded,dateLastModified',
      },
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<{ data: RawBullhornNote }>(
      `/entity/Note/${id}`,
      { fields: 'id,comments,action,clientContact,clientCorporation,jobOrder,personReference,dateAdded,dateLastModified' },
    )
    return transformNote(res.data)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<{ changedEntityId: number }>(
      '/entity/Note',
      body,
    )
    return this.getNote(credentials, String(res.changedEntityId))
  }
}
