/**
 * NetSuite CRM adapter for the CRM vertical.
 *
 * Maps the NetSuite SuiteTalk REST API v1 to canonical CRM resources.
 * Docs: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1544281617.html
 *
 * Auth: OAuth2 (TBA — complex NetSuite-specific OAuth1a or OAuth2 PKCE)
 * Base URL: https://{accountId}.suitetalk.api.netsuite.com/services/rest/record/v1
 * accountId: read from credentials.extra.accountId
 *
 * Per spec: only contacts and companies are implemented.
 * All other resources return [].
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { NetsuiteCrmClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import { transformContact, type RawNetsuiteContact } from './transform/contact'
import { transformCompany, type RawNetsuiteCompany } from './transform/company'

export interface NetsuiteCrmAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class NetsuiteCrmAdapter implements CrmAdapter {
  readonly platform = 'netsuite-crm'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: NetsuiteCrmAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth (OAuth2 — TBA) ────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    // NetSuite uses account-specific auth URLs; provide a placeholder
    // Actual implementation requires account ID from credentials/config
    const url = new URL('https://system.netsuite.com/app/login/oauth2/authorize.nl')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', this.clientId ?? '')
    url.searchParams.set('redirect_uri', this.redirectUri ?? '')
    url.searchParams.set('scope', (overrideScopes ?? ['rest_webservices']).join(' '))
    url.searchParams.set('state', state)
    return url.toString()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('NetSuite CRM: clientId and clientSecret required')
    }
    const res = await fetch('https://system.netsuite.com/services/rest/auth/oauth2/v1/token', {
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
      throw new Error(`NetSuite CRM token exchange failed: ${text}`)
    }
    const json = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken || !this.clientId || !this.clientSecret) return credentials
    const res = await fetch('https://system.netsuite.com/services/rest/auth/oauth2/v1/token', {
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
    const json = await res.json() as { access_token: string; expires_in?: number }
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

  private c(creds: Credentials): NetsuiteCrmClient {
    return new NetsuiteCrmClient(creds)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
      offset: ((Number(params['page'] ?? 1) - 1) * Number(params['limit'] ?? DEFAULT_PAGE_SIZE)),
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.c(credentials).list<RawNetsuiteContact>('/contact', this.pageParams(params))
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.c(credentials).get<RawNetsuiteContact>(`/contact/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body: Record<string, unknown> = {}
    if (data.first_name !== undefined) body.firstName = data.first_name
    if (data.last_name !== undefined) body.lastName = data.last_name
    if (data.email !== undefined) body.email = data.email
    if (data.phone !== undefined) body.phone = data.phone
    const raw = await this.c(credentials).post<RawNetsuiteContact>('/contact', body)
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body: Record<string, unknown> = {}
    if (data.first_name !== undefined) body.firstName = data.first_name
    if (data.last_name !== undefined) body.lastName = data.last_name
    if (data.email !== undefined) body.email = data.email
    if (data.phone !== undefined) body.phone = data.phone
    const raw = await this.c(credentials).put<RawNetsuiteContact>(`/contact/${id}`, body)
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/contact/${id}`)
  }

  // ── Companies (Customers/Vendors) ─────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.c(credentials).list<RawNetsuiteCompany>('/customer', this.pageParams(params))
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.c(credentials).get<RawNetsuiteCompany>(`/customer/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body: Record<string, unknown> = {}
    if (data.name !== undefined) body.companyName = data.name
    if (data.phone !== undefined) body.phone = data.phone
    const raw = await this.c(credentials).post<RawNetsuiteCompany>('/customer', body)
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body: Record<string, unknown> = {}
    if (data.name !== undefined) body.companyName = data.name
    if (data.phone !== undefined) body.phone = data.phone
    const raw = await this.c(credentials).put<RawNetsuiteCompany>(`/customer/${id}`, body)
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/customer/${id}`)
  }

  // ── Deals — not implemented per spec ──────────────────────────────────────

  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    return []
  }

  // ── Pipelines — not implemented per spec ──────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    return []
  }

  // ── Activities — not implemented per spec ─────────────────────────────────

  async listActivities(_credentials: Credentials, _params: QueryParams): Promise<Activity[]> {
    return []
  }

  // ── Notes — not implemented per spec ──────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    return []
  }
}
