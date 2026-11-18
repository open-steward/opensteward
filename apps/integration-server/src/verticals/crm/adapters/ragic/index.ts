import { simpleApiKey } from '@opensteward/shared'
/**
 * Ragic CRM adapter for the CRM vertical.
 *
 * Maps the Ragic REST API to canonical CRM resources.
 * Docs: https://www.ragic.com/intl/en/doc-api/
 *
 * Auth: Basic Auth with api_key:1
 * Notable:
 *   - Sheet-based data model: data lives in user-configured sheets
 *   - No fixed /contacts or /deals endpoints — uses /{account}/{sheetPath}
 *   - Field names are user-configured; defaults assumed in transforms
 *   - Account name from credentials.extra.account
 *   - Sheet paths configured in credentials.extra (contactsSheetPath, etc.)
 *   - Pipelines not applicable to Ragic
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (up to 17, depending on sheet config):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete
 *   Activities: list (if sheetPath configured)
 *   Notes:      list (if sheetPath configured)
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

import { RagicClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact } from './transform/contact'
import { transformCompany, untransformCompany } from './transform/company'
import { transformDeal, untransformDeal } from './transform/deal'
import { transformActivity, untransformActivity } from './transform/activity'
import { transformNote, untransformNote } from './transform/note'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RagicAdapterConfig {}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class RagicAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'ragic'
  readonly version = '0.1.0'

   
  constructor(_config: RagicAdapterConfig = {}) {}

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

  private client(credentials: Credentials): RagicClient {
    return new RagicClient(credentials)
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
    const sheetPath = credentials.extra?.['contactsSheetPath'] as string | undefined
    if (!sheetPath) return []
    const records = await this.client(credentials).listRecords(sheetPath, {
      limit: this.listLimit(params),
      offset: this.listOffset(params),
    })
    return records.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const sheetPath = credentials.extra?.['contactsSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: contactsSheetPath not configured')
    const record = await this.client(credentials).getRecord(sheetPath, id)
    return transformContact(record)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const sheetPath = credentials.extra?.['contactsSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: contactsSheetPath not configured')
    const c = this.client(credentials)
    const record = untransformContact(data)
    const res = await c.createRecord(sheetPath, record)
    const created = await c.getRecord(sheetPath, res._ragic_id)
    return transformContact(created)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const sheetPath = credentials.extra?.['contactsSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: contactsSheetPath not configured')
    const c = this.client(credentials)
    const record = untransformContact(data)
    await c.updateRecord(sheetPath, id, record)
    const updated = await c.getRecord(sheetPath, id)
    return transformContact(updated)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const sheetPath = credentials.extra?.['contactsSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: contactsSheetPath not configured')
    await this.client(credentials).deleteRecord(sheetPath, id)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const sheetPath = credentials.extra?.['companiesSheetPath'] as string | undefined
    if (!sheetPath) return []
    const records = await this.client(credentials).listRecords(sheetPath, {
      limit: this.listLimit(params),
      offset: this.listOffset(params),
    })
    return records.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const sheetPath = credentials.extra?.['companiesSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: companiesSheetPath not configured')
    const record = await this.client(credentials).getRecord(sheetPath, id)
    return transformCompany(record)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const sheetPath = credentials.extra?.['companiesSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: companiesSheetPath not configured')
    const c = this.client(credentials)
    const record = untransformCompany(data)
    const res = await c.createRecord(sheetPath, record)
    const created = await c.getRecord(sheetPath, res._ragic_id)
    return transformCompany(created)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const sheetPath = credentials.extra?.['companiesSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: companiesSheetPath not configured')
    const c = this.client(credentials)
    const record = untransformCompany(data)
    await c.updateRecord(sheetPath, id, record)
    const updated = await c.getRecord(sheetPath, id)
    return transformCompany(updated)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    const sheetPath = credentials.extra?.['companiesSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: companiesSheetPath not configured')
    await this.client(credentials).deleteRecord(sheetPath, id)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const sheetPath = credentials.extra?.['dealsSheetPath'] as string | undefined
    if (!sheetPath) return []
    const records = await this.client(credentials).listRecords(sheetPath, {
      limit: this.listLimit(params),
      offset: this.listOffset(params),
    })
    return records.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const sheetPath = credentials.extra?.['dealsSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: dealsSheetPath not configured')
    const record = await this.client(credentials).getRecord(sheetPath, id)
    return transformDeal(record)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const sheetPath = credentials.extra?.['dealsSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: dealsSheetPath not configured')
    const c = this.client(credentials)
    const record = untransformDeal(data)
    const res = await c.createRecord(sheetPath, record)
    const created = await c.getRecord(sheetPath, res._ragic_id)
    return transformDeal(created)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const sheetPath = credentials.extra?.['dealsSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: dealsSheetPath not configured')
    const c = this.client(credentials)
    const record = untransformDeal(data)
    await c.updateRecord(sheetPath, id, record)
    const updated = await c.getRecord(sheetPath, id)
    return transformDeal(updated)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    const sheetPath = credentials.extra?.['dealsSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: dealsSheetPath not configured')
    await this.client(credentials).deleteRecord(sheetPath, id)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const sheetPath = credentials.extra?.['activitiesSheetPath'] as string | undefined
    if (!sheetPath) return []
    const records = await this.client(credentials).listRecords(sheetPath, {
      limit: this.listLimit(params),
      offset: this.listOffset(params),
    })
    return records.map(transformActivity)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const sheetPath = credentials.extra?.['activitiesSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: activitiesSheetPath not configured')
    const c = this.client(credentials)
    const record = untransformActivity(data)
    const res = await c.createRecord(sheetPath, record)
    const created = await c.getRecord(sheetPath, res._ragic_id)
    return transformActivity(created)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const sheetPath = credentials.extra?.['notesSheetPath'] as string | undefined
    if (!sheetPath) return []
    const records = await this.client(credentials).listRecords(sheetPath, {
      limit: this.listLimit(params),
      offset: this.listOffset(params),
    })
    return records.map(transformNote)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const sheetPath = credentials.extra?.['notesSheetPath'] as string | undefined
    if (!sheetPath) throw new Error('Ragic: notesSheetPath not configured')
    const c = this.client(credentials)
    const record = untransformNote(data)
    const res = await c.createRecord(sheetPath, record)
    const created = await c.getRecord(sheetPath, res._ragic_id)
    return transformNote(created)
  }
}
