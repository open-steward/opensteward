import { simpleApiKey } from '@opensteward/shared'
/**
 * Workbooks adapter for the CRM vertical.
 *
 * Maps the Workbooks REST API to canonical CRM resources.
 * Docs: https://github.com/workbooks/client_lib
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   API key passed as `api_key` query parameter on every request.
 *   credentials.accessToken = api_key
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (3):
 *   Contacts: list, get, create
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Companies, Deals, Pipelines, Notes, Activities
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { WebhookEvent } from '../../schema/webhook'

import { WorkbooksClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawWorkbooksContact,
} from './transform/contact'

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class WorkbooksAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'workbooks'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Workbooks uses API key auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes apiKey as code.
    return {
      accessToken: code,
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): WorkbooksClient {
    return new WorkbooksClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // Workbooks: GET /crm/people.api with pagination params

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = Number(params['page'] ?? 1)
    const start = (page - 1) * limit
    const raw = await this.client(credentials).get<{ data: RawWorkbooksContact[] } | RawWorkbooksContact[]>(
      '/crm/people.api',
      { _start: String(start), _limit: String(limit) },
    )
    const items: RawWorkbooksContact[] = Array.isArray(raw) ? raw : (raw.data ?? [])
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<{ data: RawWorkbooksContact[] } | RawWorkbooksContact[]>(
      '/crm/people.api',
      { '_ff[]': 'id', '_ft[]': 'eq', '_fc[]': id },
    )
    const items: RawWorkbooksContact[] = Array.isArray(raw) ? raw : (raw.data ?? [])
    const person = items[0]
    if (!person) {
      throw Object.assign(new Error(`Workbooks: contact ${id} not found`), { statusCode: 404 })
    }
    return transformContact(person)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<{ affected_objects: RawWorkbooksContact[] }>(
      '/crm/people.api',
      body,
    )
    const created = raw.affected_objects?.[0]
    if (!created) {
      throw new Error('Workbooks: contact creation returned no data')
    }
    return transformContact(created)
  }
}
