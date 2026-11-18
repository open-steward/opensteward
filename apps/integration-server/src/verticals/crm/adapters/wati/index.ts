/**
 * Wati adapter for the CRM vertical.
 *
 * Wati is a WhatsApp Business API platform. It exposes a contact management
 * API that maps to the canonical CRM Contact resource.
 *
 * Docs: https://docs.wati.io/reference/introduction
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 *   Bearer token sent in the Authorization header.
 *   credentials.accessToken = Bearer token
 *   credentials.extra.baseUrl = per-tenant base URL
 *     e.g. https://live-mt-server.wati.io/123456
 *
 * ── Coverage ─────────────────────────────────────────────────────────────────
 *
 * Implemented (3):
 *   Contacts: list, get, create
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Companies, Deals, Pipelines, Notes, Activities
 *   (Wati is a messaging platform, not a full-featured CRM)
 */

import { simpleApiKey } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { WebhookEvent } from '../../schema/webhook'

import { WatiClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawWatiContact,
} from './transform/contact'

const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * Wati v3 contacts list response envelope.
 *
 * GET /api/ext/v3/contacts →
 *   { contact_list: ContactDto[], page_number: number, page_size: number }
 */
interface WatiContactListResponse {
  contact_list?: RawWatiContact[]
  page_number?: number
  page_size?: number
  [key: string]: unknown
}

export class WatiAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'wati'
  readonly version = '0.1.0'

  // ── Auth ─────────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Wati uses Bearer token auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes: code = Bearer token, redirectUri = per-tenant base URL.
    return {
      accessToken: code,
      extra: { baseUrl: _redirectUri },
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Bearer tokens do not expire automatically.
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): WatiClient {
    return new WatiClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const pageSize = params.limit ?? DEFAULT_PAGE_SIZE
    const pageNumber = Number(params['page'] ?? 1)
    const raw = await this.client(credentials).get<WatiContactListResponse>(
      '/api/ext/v3/contacts',
      { page_size: pageSize, page_number: pageNumber },
    )
    const items = raw.contact_list ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // GET /api/ext/v3/contacts/{target} — target can be contactId or phone number.
    const raw = await this.client(credentials).get<RawWatiContact>(
      `/api/ext/v3/contacts/${encodeURIComponent(id)}`,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    // Wati addContact: POST /api/v1/addContact/{whatsappNumber}
    // Phone number is required for Wati contacts.
    const phone = data.phone ?? ''
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawWatiContact>(
      `/api/v1/addContact/${encodeURIComponent(phone)}`,
      body,
    )
    return transformContact(raw)
  }
}
