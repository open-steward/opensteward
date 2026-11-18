import { simpleApiKey } from '@opensteward/shared'
/**
 * Sansan CRM adapter for the CRM vertical.
 *
 * Maps the Sansan REST API to canonical CRM resources.
 * Docs: https://developer.sansan.com/
 *
 * Auth: API key via X-Sansan-Key header
 * Notable:
 *   - Business card scanning and B2B contact platform
 *   - Strong contacts (persons) API; no standalone companies or deals
 *   - Contacts derived from scanned business cards
 *   - TODO: Verify exact endpoint paths from https://developer.sansan.com/
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (5):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  [] (not supported)
 *   Deals:      [] (not supported)
 *   Activities: [] (not supported)
 *   Notes:      [] (not supported)
 *   Auth:       getAuthUrl (stub), exchangeCode (stub), refreshCredentials
 *   Webhooks:   verifyWebhook (stub), parseWebhookEvents (stub)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { SansanClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawSansanContact } from './transform/contact'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SansanAdapterConfig {}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SansanAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sansan'
  readonly version = '0.1.0'

   
  constructor(_config: SansanAdapterConfig = {}) {}

  // ── Auth (API key — stubs) ─────────────────────────────────────────────────

   
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

  private client(credentials: Credentials): SansanClient {
    return new SansanClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
      // TODO: Verify Sansan pagination params (offset, page, cursor?)
      offset: (Number(params['page'] ?? 1) - 1) * Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // TODO: Verify endpoint path from https://developer.sansan.com/
    const { items } = await this.client(credentials).list<RawSansanContact>(
      '/contacts',
      this.listParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // TODO: Verify endpoint path from https://developer.sansan.com/
    const res = await this.client(credentials).get<RawSansanContact>(`/contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    // TODO: Verify endpoint path from https://developer.sansan.com/
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawSansanContact>('/contacts', body)
    return transformContact(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    // TODO: Verify endpoint path from https://developer.sansan.com/
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawSansanContact>(`/contacts/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    // TODO: Verify endpoint path from https://developer.sansan.com/
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (not supported) ──────────────────────────────────────────────

   
  async listCompanies(_credentials: Credentials, _params: QueryParams): Promise<Company[]> {
    return []
  }

  // ── Deals (not supported) ─────────────────────────────────────────────────

   
  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    return []
  }

  // ── Activities (not supported) ────────────────────────────────────────────

   
  async listActivities(_credentials: Credentials, _params: QueryParams): Promise<Activity[]> {
    return []
  }

  // ── Notes (not supported) ─────────────────────────────────────────────────

   
  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    return []
  }
}
