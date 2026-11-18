import { simpleApiKey } from '@opensteward/shared'
/**
 * LeadSquared adapter for the CRM vertical.
 *
 * Maps the LeadSquared REST API v2 to canonical CRM resources.
 * Docs: https://apidocs.leadsquared.com/
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   API key + secret passed as query params on every request.
 *   credentials.accessToken = access key
 *   credentials.refreshToken = secret key
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (3):
 *   Contacts: list, get, create
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Companies, Deals, Pipelines, Notes (not standard in LeadSquared API)
 *   Activities — uses same endpoint as deals, skipped for simplicity
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { WebhookEvent } from '../../schema/webhook'

import { LeadsquaredClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawLeadsquaredContact,
} from './transform/contact'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class LeadSquaredAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'leadsquared'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // LeadSquared uses API key + secret, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    // Caller passes accessKey as code, secretKey as redirectUri.
    return {
      accessToken: code,
      refreshToken: redirectUri,
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

  private client(credentials: Credentials): LeadsquaredClient {
    return new LeadsquaredClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // LeadSquared uses POST for reads with JSON body.

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = Number(params['page'] ?? 1)
    const raw = await this.client(credentials).post<RawLeadsquaredContact[]>(
      '/LeadManagement.svc/Leads.GetAll',
      {
        Parameter: { LookupName: 'EmailAddress', LookupValue: '' },
        Paging: { PageIndex: page, PageSize: limit },
      },
    )
    return (raw ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).post<RawLeadsquaredContact[]>(
      '/LeadManagement.svc/Leads.GetById',
      { LeadId: id },
    )
    const lead = Array.isArray(raw) ? raw[0] : raw
    if (!lead) {
      throw Object.assign(new Error(`LeadSquared: contact ${id} not found`), { statusCode: 404 })
    }
    return transformContact(lead)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawLeadsquaredContact[]>(
      '/LeadManagement.svc/Lead.Create',
      [body],
    )
    const created = Array.isArray(raw) ? raw[0] : raw
    if (!created) {
      throw new Error('LeadSquared: contact creation returned no data')
    }
    return transformContact(created)
  }
}
