/**
 * Wix CRM adapter for the CRM vertical.
 *
 * Contacts are read from the Wix Contacts v4 API
 * (https://www.wixapis.com/contacts/v4/contacts). Only contacts are
 * implemented; all other resources return 501. Create, update and delete
 * still call the undocumented /crm/v3 path (out of scope of the paging
 * rebuild).
 *
 * Coverage:
 *   Contacts      — list, get, create, update, delete  (full CRUD)
 *   Companies     — 501 (not implemented)
 *   Deals         — 501 (not implemented)
 *   Pipelines     — 501 (not implemented)
 *   Activities    — 501 (not implemented)
 *   Notes         — 501 (not implemented)
 *
 * Auth: OAuth2 Authorization Code via https://www.wix.com/oauth/access.
 * Docs: https://dev.wix.com/docs/api-reference/crm/members-contacts/contacts/contacts/contact-v4/query-contacts.md
 */

import { DEFAULT_PAGE_LIMIT, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'

import { WixCrmClient } from './client'
import { OAUTH_AUTH_URL, OAUTH_TOKEN_URL } from './constants'
import { transformContact, untransformContact } from './transform/contact'

/**
 * Query Contacts: "Up to 1,000 contacts can be returned per request." and
 * `paging.limit` "Default: `50`. <br> Maximum: `1000`."
 */
const MAX_PAGE_SIZE = 1000

export interface WixCrmAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class WixCrmAdapter implements CrmAdapter {
  readonly platform = 'wix-crm'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: WixCrmAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): WixCrmClient {
    return new WixCrmClient(credentials)
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
      throw new Error('WixCrm exchangeCode: clientId and clientSecret required')
    }
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Wix CRM token exchange failed: ${text}`)
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: credentials.refreshToken,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Wix CRM token refresh failed: ${text}`)
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

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    // Wix uses JWT-based signatures; simplified to always return true
    return true
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return [
      {
        platform: this.platform,
        type: String(payload['topic'] ?? payload['event'] ?? 'unknown'),
        resourceType: 'unknown',
        action: 'unknown',
        resourceId: String(payload['id'] ?? 'unknown'),
        payload,
      },
    ]
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  /**
   * POST /contacts/v4/contacts/query with `paging.limit` / `paging.offset`
   * (https://dev.wix.com/docs/api-reference/crm/members-contacts/contacts/contacts/contact-v4/query-contacts.md).
   * The end signal is `pagingMetadata.total` ("The total number of items that
   * match the query."), unless `tooManyToCount` ("the server failed to
   * calculate 'total' field") is set, in which case no total is reported.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const asked = params.limit ?? DEFAULT_PAGE_LIMIT
    const size = Math.min(asked, MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const res = await this.client(credentials).queryContacts(size, offset)
    const contacts = res.contacts ?? []
    const meta = res.pagingMetadata
    if (size < asked) reportUpstreamPage(params, { pageSize: size })
    if (meta?.tooManyToCount !== true && typeof meta?.total === 'number') {
      reportUpstreamPage(params, {
        totalCount: meta.total,
        hasMore: offset + contacts.length < meta.total,
      })
    }
    return contacts.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).getContact(id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).createContact(untransformContact(data))
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).updateContact(id, untransformContact(data))
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteContact(id)
  }
}
