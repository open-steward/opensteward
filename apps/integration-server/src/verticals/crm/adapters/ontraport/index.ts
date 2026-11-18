import { simpleApiKey } from '@opensteward/shared'
/**
 * Ontraport CRM adapter for the CRM vertical.
 *
 * Maps the Ontraport API to canonical CRM resources.
 * Docs: https://api.ontraport.com/doc/
 *
 * Auth: API Key (Api-Key header) + App ID (Api-Appid header)
 * credentials.accessToken = Api-Key
 * credentials.extra.appId  = Api-Appid
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (16):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list (returns []) — no native deals object
 *   Activities: list, get, create  (Tasks)
 *   Notes:      list, get, create
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { OntraportClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawOntraportContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawOntraportCompany } from './transform/company'
import { transformActivity, untransformActivity, type RawOntraportTask } from './transform/activity'
import { transformNote, untransformNote, type RawOntraportNote } from './transform/note'

// No OAuth — API key is stored in credentials.accessToken at runtime
export type OntraportAdapterConfig = Record<string, never>
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class OntraportAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'ontraport'
  readonly version = '0.1.0'

  // ── Auth stubs (API-key adapter) ──────────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error('Ontraport uses API key auth, not OAuth2')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Ontraport uses API key auth, not OAuth2')
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

  private client(credentials: Credentials): OntraportClient {
    return new OntraportClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      start: (Number(params['page'] ?? 1) - 1) * Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
      range: Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.client(credentials).list<RawOntraportContact>('/Contacts', this.listParams(params))
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawOntraportContact>('/Contacts', { id })
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawOntraportContact>('/Contacts', body)
    return transformContact(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = { id, ...untransformContact(data) }
    const res = await this.client(credentials).put<RawOntraportContact>('/Contacts', body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('/Contacts', { id })
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.client(credentials).list<RawOntraportCompany>('/Companies', this.listParams(params))
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawOntraportCompany>('/Companies', { id })
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawOntraportCompany>('/Companies', body)
    return transformCompany(res)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = { id, ...untransformCompany(data) }
    const res = await this.client(credentials).put<RawOntraportCompany>('/Companies', body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('/Companies', { id })
  }

  // ── Deals (no native object) ───────────────────────────────────────────────

  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    return []
  }

  // ── Pipelines (no native object) ──────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    return []
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.client(credentials).list<RawOntraportTask>('/Tasks', this.listParams(params))
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawOntraportTask>('/Tasks', { id })
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawOntraportTask>('/Tasks', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.client(credentials).list<RawOntraportNote>('/Notes', this.listParams(params))
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<RawOntraportNote>('/Notes', { id })
    return transformNote(res)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawOntraportNote>('/Notes', body)
    return transformNote(res)
  }
}
