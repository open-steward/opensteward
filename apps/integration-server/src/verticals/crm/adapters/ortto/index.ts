import { simpleApiKey, pageOffset, reportUpstreamPage } from '@opensteward/shared'
/**
 * Ortto adapter for the CRM vertical.
 *
 * Maps the Ortto (formerly Autopilot) API to canonical CRM resources.
 * Docs: https://ortto.com/developers/
 *
 * Auth: API key via X-Api-Key header
 * Notable:
 *   - Marketing automation + CDP with contact-centric model
 *   - Contacts use Ortto custom field keys (str::first, str::email, etc.)
 *   - Companies: minimal support — Ortto is primarily person-focused
 *   - Deals, Pipelines: not natively supported — return []
 *   - Activities: partial support via TODO endpoints
 *   - Notes: not natively supported — return []
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts:   list, get, create, update, delete
 *   Auth:       getAuthUrl (stub), exchangeCode (stub), refreshCredentials
 *   Webhooks:   verifyWebhook (passthrough), parseWebhookEvents (stub)
 *
 * Omitted (not supported by Ortto):
 *   Companies, Deals, Pipelines, Activities, Notes — return []
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'

import { OrttoClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawOrttoContact } from './transform/contact'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OrttoAdapterConfig {}

interface OrttoPersonListResponse {
  contacts?: RawOrttoContact[]
  has_more?: boolean
  next_offset?: number
  meta?: { total_matches?: number; [key: string]: unknown }
  [key: string]: unknown
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class OrttoAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'ortto'
  readonly version = '0.1.0'

  /**
   * /v1/person/get documents `limit` as "integer between 1 to 500", and reads a
   * value beyond it as 50, so a larger caller limit must be clamped here.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

   
  constructor(_config: OrttoAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

   
  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

   
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: '' }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): OrttoClient {
    return new OrttoClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // TODO: Confirm endpoint — Ortto uses /v1/person/get (POST) with filter body

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // Paged by `limit` + `offset`; the response answers `has_more` and
    // `meta.total_matches` (https://help.ortto.com/a-258-retrieve-one-or-more-people-get).
    const asked = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const limit =
      Number.isFinite(asked) && asked >= 1 ? Math.min(Math.floor(asked), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE
    const res = await this.client(credentials).post<OrttoPersonListResponse>('/person/get', {
      fields: ['str::first', 'str::last', 'str::email', 'phn::phone', 'str::title'],
      limit,
      offset: pageOffset(params, limit),
    })
    const totalCount = res.meta?.total_matches
    reportUpstreamPage(params, {
      ...(typeof res.has_more === 'boolean' ? { hasMore: res.has_more } : {}),
      ...(typeof totalCount === 'number' ? { totalCount } : {}),
      pageSize: limit,
    })
    return (res.contacts ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // TODO: Verify endpoint path for single contact fetch
    const res = await this.client(credentials).post<OrttoPersonListResponse>('/person/get', {
      filter: { '=': ['contact_id', id] },
      fields: ['str::first', 'str::last', 'str::email', 'phn::phone', 'str::title'],
    })
    const contact = res.contacts?.[0]
    if (!contact) throw Object.assign(new Error(`Ortto: contact ${id} not found`), { statusCode: 404 })
    return transformContact(contact)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    // TODO: Verify endpoint path and response shape for contact creation
    const payload = untransformContact(data)
    const raw = await this.client(credentials).post<RawOrttoContact>('/person/merge', {
      merge_by: [['str::email']],
      merge_strategy: 1,
      people: [payload],
    })
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const payload = untransformContact(data)
    // Ortto merge with same id for update
    await this.client(credentials).post<unknown>('/person/merge', {
      merge_by: [['contact_id']],
      merge_strategy: 2,
      people: [{ id, ...payload }],
    })
    return this.getContact(credentials, id)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    // TODO: Verify delete endpoint for Ortto contacts
    await this.client(credentials).post<unknown>('/person/delete', { ids: [id] })
  }
}
