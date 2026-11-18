import { simpleApiKey } from '@opensteward/shared'
/**
 * Kintone (Cybozu) CRM adapter for the CRM vertical.
 *
 * Maps the Kintone REST API to canonical CRM resources.
 * Docs: https://kintone.dev/en/docs/kintone/rest-api/
 *
 * Auth: API token via X-Cybozu-API-Token header
 * Notable:
 *   - App-based data model: data lives in user-configured "apps" (spreadsheets)
 *   - No fixed /contacts or /deals endpoints — uses /records.json?app={appId}
 *   - Field codes are user-configured; defaults assumed in transforms
 *   - Subdomain required: https://{subdomain}.kintone.com/k/v1/
 *   - App IDs configured in credentials.extra (contactsAppId, companiesAppId, dealsAppId)
 *   - Pipelines not applicable to Kintone
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (16):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete
 *   Activities: list (if appId configured)
 *   Notes:      list (if appId configured)
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

import { KintoneClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact } from './transform/contact'
import { transformCompany, untransformCompany } from './transform/company'
import { transformDeal, untransformDeal } from './transform/deal'
import { transformActivity, untransformActivity } from './transform/activity'
import { transformNote, untransformNote } from './transform/note'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface KintoneAdapterConfig {}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class KintoneAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'kintone'
  readonly version = '0.1.0'

  constructor(_config: KintoneAdapterConfig = {}) {}

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

  private client(credentials: Credentials): KintoneClient {
    return new KintoneClient(credentials)
  }

  private listOffset(params: QueryParams): number {
    const page = Number(params['page'] ?? 1)
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    return (page - 1) * limit
  }

  private listLimit(params: QueryParams): number {
    return Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['contactsAppId'] as string | undefined
    if (!appId) return []
    const records = await c.listRecords(appId, {
      limit: this.listLimit(params),
      offset: this.listOffset(params),
    })
    return records.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['contactsAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: contactsAppId not configured')
    const record = await c.getRecord(appId, id)
    return transformContact(record)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['contactsAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: contactsAppId not configured')
    const record = untransformContact(data)
    const res = await c.createRecord(appId, record)
    const created = await c.getRecord(appId, res.id)
    return transformContact(created)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['contactsAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: contactsAppId not configured')
    const record = untransformContact(data)
    await c.updateRecord(appId, id, record)
    const updated = await c.getRecord(appId, id)
    return transformContact(updated)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['contactsAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: contactsAppId not configured')
    await c.deleteRecords(appId, [id])
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['companiesAppId'] as string | undefined
    if (!appId) return []
    const records = await c.listRecords(appId, {
      limit: this.listLimit(params),
      offset: this.listOffset(params),
    })
    return records.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['companiesAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: companiesAppId not configured')
    const record = await c.getRecord(appId, id)
    return transformCompany(record)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['companiesAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: companiesAppId not configured')
    const record = untransformCompany(data)
    const res = await c.createRecord(appId, record)
    const created = await c.getRecord(appId, res.id)
    return transformCompany(created)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['companiesAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: companiesAppId not configured')
    const record = untransformCompany(data)
    await c.updateRecord(appId, id, record)
    const updated = await c.getRecord(appId, id)
    return transformCompany(updated)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['companiesAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: companiesAppId not configured')
    await c.deleteRecords(appId, [id])
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['dealsAppId'] as string | undefined
    if (!appId) return []
    const records = await c.listRecords(appId, {
      limit: this.listLimit(params),
      offset: this.listOffset(params),
    })
    return records.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['dealsAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: dealsAppId not configured')
    const record = await c.getRecord(appId, id)
    return transformDeal(record)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['dealsAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: dealsAppId not configured')
    const record = untransformDeal(data)
    const res = await c.createRecord(appId, record)
    const created = await c.getRecord(appId, res.id)
    return transformDeal(created)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['dealsAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: dealsAppId not configured')
    const record = untransformDeal(data)
    await c.updateRecord(appId, id, record)
    const updated = await c.getRecord(appId, id)
    return transformDeal(updated)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['dealsAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: dealsAppId not configured')
    await c.deleteRecords(appId, [id])
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['activitiesAppId'] as string | undefined
    if (!appId) return []
    const records = await c.listRecords(appId, {
      limit: this.listLimit(params),
      offset: this.listOffset(params),
    })
    return records.map(transformActivity)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['activitiesAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: activitiesAppId not configured')
    const record = untransformActivity(data)
    const res = await c.createRecord(appId, record)
    const created = await c.getRecord(appId, res.id)
    return transformActivity(created)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['notesAppId'] as string | undefined
    if (!appId) return []
    const records = await c.listRecords(appId, {
      limit: this.listLimit(params),
      offset: this.listOffset(params),
    })
    return records.map(transformNote)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const c = this.client(credentials)
    const appId = credentials.extra?.['notesAppId'] as string | undefined
    if (!appId) throw new Error('Kintone: notesAppId not configured')
    const record = untransformNote(data)
    const res = await c.createRecord(appId, record)
    const created = await c.getRecord(appId, res.id)
    return transformNote(created)
  }
}
