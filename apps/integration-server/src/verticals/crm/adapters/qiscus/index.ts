import { simpleApiKey } from '@opensteward/shared'
/**
 * Qiscus CRM adapter for the CRM vertical.
 *
 * Maps the Qiscus REST API to canonical CRM resources.
 * Website: https://www.qiscus.com
 * Docs: https://documentation.qiscus.com/
 *
 * Auth: API key (Qiscus-App-Id + Qiscus-Secret-Key headers)
 *   - credentials.accessToken = secret_key
 *   - credentials.extra.appId = app_id
 * Notable:
 *   - Singapore/SE Asia omnichannel chat + CRM platform
 *   - Primarily a messaging platform; CRM layer is limited
 *   - Contacts are mapped from "customers" in Qiscus
 *   - Companies, Deals, Pipelines, Activities, Notes are not supported natively
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts (customers): list, get, create, update, delete
 *   Companies: not supported (returns [])
 *   Deals: not supported (returns [])
 *   Pipelines: not supported (returns [])
 *   Activities: not supported (returns [])
 *   Notes: not supported (returns [])
 *   Auth: getAuthUrl (stub), exchangeCode (stub), refreshCredentials (stub)
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

import { QiscusClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawQiscusContact } from './transform/contact'

export interface QiscusAdapterConfig {
  appId?: string
  secretKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class QiscusAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'qiscus'
  readonly version = '0.1.0'

  constructor(_config: QiscusAdapterConfig = {}) {}

  // ── Auth (API key — no OAuth flow) ────────────────────────────────────────

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

  private client(credentials: Credentials): QiscusClient {
    return new QiscusClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    return { limit, page }
  }

  // ── Contacts (customers in Qiscus) ────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    try {
      // TODO: verify endpoint path
      const { items } = await this.client(credentials).list<RawQiscusContact>(
        '/api/v1/admin/contacts',
        this.listParams(params),
      )
      return items.map(transformContact)
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404) return []
      throw err
    }
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // TODO: verify endpoint path
    const res = await this.client(credentials).get<{ data: RawQiscusContact } | RawQiscusContact>(
      `/api/v1/admin/contacts/${id}`,
    )
    const data = (res as { data?: RawQiscusContact }).data ?? res as RawQiscusContact
    return transformContact(data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).post<{ data: RawQiscusContact } | RawQiscusContact>(
      '/api/v1/admin/contacts',
      body,
    )
    const contact = (res as { data?: RawQiscusContact }).data ?? res as RawQiscusContact
    return transformContact(contact)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).put<{ data: RawQiscusContact } | RawQiscusContact>(
      `/api/v1/admin/contacts/${id}`,
      body,
    )
    const contact = (res as { data?: RawQiscusContact }).data ?? res as RawQiscusContact
    return transformContact(contact)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    // TODO: verify endpoint path
    await this.client(credentials).delete(`/api/v1/admin/contacts/${id}`)
  }

  // ── Companies — not supported natively ───────────────────────────────────

  async listCompanies(_credentials: Credentials, _params: QueryParams): Promise<Company[]> {
    return []
  }

  // ── Deals — not supported natively ───────────────────────────────────────

  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    return []
  }

  // ── Pipelines — not supported natively ───────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    return []
  }

  // ── Activities — not supported natively ──────────────────────────────────

  async listActivities(_credentials: Credentials, _params: QueryParams): Promise<Activity[]> {
    return []
  }

  // ── Notes — not supported natively ───────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    return []
  }
}
