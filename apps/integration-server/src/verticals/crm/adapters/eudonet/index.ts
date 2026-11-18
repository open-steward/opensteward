/**
 * Eudonet adapter for the CRM vertical.
 *
 * Maps the Eudonet EudoAPI (REST + JSON) to canonical CRM resources.
 * Docs: http://demo.eudonet.com/eudoapi/eudoapidoc/swaggerui/
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   Eudonet uses a subscriber + user credential model. A short-lived token
 *   is obtained by POSTing to /Authenticate/Token and passed as the `x-auth`
 *   header on every subsequent request.
 *
 *   The Connect Link form collects the six required fields:
 *     subscriberLogin, subscriberPassword — organisation-level credentials
 *     baseName                            — database / tenant name
 *     userLogin, userPassword             — user-level credentials
 *     instanceUrl                         — base URL of the Eudonet instance
 *                                           e.g. https://demo.eudonet.com/EudoAPI
 *
 *   All values are stored in credentials.extra; the token is fetched lazily
 *   per request inside EudonetClient.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (4 resources, 12 operations):
 *   Contacts  : list, get, create, update
 *   Companies : list, get, create, update
 *   Deals     : list, get, create, update
 *   Notes     : list, get, create, update
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: activity  — Eudonet has no standard activity/task table in
 *                          EudoAPI; activity-like data lives in custom tables
 *                          configured per installation and cannot be addressed
 *                          via a generic adapter.
 * Unavailable: pipeline  — Eudonet does not expose a standard pipeline or
 *                          deal-stage resource in EudoAPI; stage values are
 *                          stored as plain text fields on the Deals table
 *                          rather than as a queryable pipeline entity.
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   deleteContact / deleteCompany / deleteDeal / deleteNote — the Eudonet
 *                CUD API does support DELETE but the semantics vary by
 *                installation policy; omitted to avoid accidental data loss.
 */

import { customForm } from '@opensteward/shared'
import type { CredentialField } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact }  from '../../schema/contact'
import type { Company }  from '../../schema/company'
import type { Deal }     from '../../schema/deal'
import type { Note }     from '../../schema/note'

import { EudonetClient } from './client'
import { DEFAULT_PAGE_SIZE, TAB_CONTACTS, TAB_COMPANIES, TAB_DEALS, TAB_NOTES } from './constants'
import { transformContact, untransformContact } from './transform/contact'
import { transformCompany, untransformCompany } from './transform/company'
import { transformDeal,    untransformDeal    } from './transform/deal'
import { transformNote,    untransformNote    } from './transform/note'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'

// ── Credential form ────────────────────────────────────────────────────────────

const EUDONET_FIELDS: CredentialField[] = [
  {
    name:        'subscriberLogin',
    label:       'Subscriber login',
    type:        'text',
    required:    true,
    helpText:    'Organisation-level login provided by Eudonet.',
  },
  {
    name:        'subscriberPassword',
    label:       'Subscriber password',
    type:        'password',
    required:    true,
    helpText:    'Organisation-level password provided by Eudonet.',
  },
  {
    name:        'baseName',
    label:       'Database name',
    type:        'text',
    required:    true,
    helpText:    'Eudonet database (BaseName) identifier.',
  },
  {
    name:        'userLogin',
    label:       'User login',
    type:        'text',
    required:    true,
    helpText:    'Individual user login within the Eudonet database.',
  },
  {
    name:        'userPassword',
    label:       'User password',
    type:        'password',
    required:    true,
    helpText:    'Individual user password.',
  },
  {
    name:        'instanceUrl',
    label:       'Instance URL',
    type:        'text',
    required:    false,
    placeholder: 'https://my.eudonet.com/EudoAPI',
    helpText:    'Base URL of your Eudonet instance (up to and including /EudoAPI). Leave blank to use the default.',
  },
]

const CREDENTIAL_FORM = customForm({
  fields: EUDONET_FIELDS,
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const required = ['subscriberLogin', 'subscriberPassword', 'baseName', 'userLogin', 'userPassword']
    for (const key of required) {
      if (!input[key]?.trim()) {
        const field = EUDONET_FIELDS.find(f => f.name === key)
        throw new Error(`${field?.label ?? key} is required.`)
      }
    }
    return {
      // accessToken is a sentinel — actual auth happens inside EudonetClient.
      accessToken: `eudonet:${input['subscriberLogin']?.trim()}`,
      extra: {
        subscriberLogin:    input['subscriberLogin']?.trim(),
        subscriberPassword: input['subscriberPassword'],
        baseName:           input['baseName']?.trim(),
        userLogin:          input['userLogin']?.trim(),
        userPassword:       input['userPassword'],
        instanceUrl:        input['instanceUrl']?.trim() || undefined,
        userLang:           'fr',
        productName:        'EudoAPI',
      },
    }
  },
})

// ── Adapter ────────────────────────────────────────────────────────────────────

export class EudonetAdapter implements CrmAdapter {
  readonly platform = 'eudonet'
  readonly version  = '0.1.0'

  credentialFields   = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  // ── Webhooks ─────────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>) {
    return _parseWebhookEvents(payload)
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Eudonet uses credential-form auth, not OAuth2.
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Not used — credentials are captured via the Connect Link form.
    return { accessToken: '' }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Eudonet tokens are obtained lazily per-request inside EudonetClient;
    // no explicit refresh needed at the adapter layer.
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private client(credentials: Credentials): EudonetClient {
    return new EudonetClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page  = Number(params['page'] ?? 1)
    const res   = await this.client(credentials).search(TAB_CONTACTS, {
      ShowMetadata: false,
      RowsPerPage:  limit,
      NumPage:      page,
    })
    return (res.ResultData?.Rows ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const row = await this.client(credentials).getFile(TAB_CONTACTS, id)
    if (!row) {
      throw Object.assign(new Error(`Eudonet: contact ${id} not found`), { statusCode: 404 })
    }
    return transformContact(row)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const cl     = this.client(credentials)
    const fields = untransformContact(data)
    const fileId = await cl.create(TAB_CONTACTS, { Fields: fields })
    const row    = await cl.getFile(TAB_CONTACTS, fileId)
    if (!row) throw new Error('Eudonet: contact creation returned no data')
    return transformContact(row)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const cl     = this.client(credentials)
    const fields = untransformContact(data)
    await cl.update(TAB_CONTACTS, id, { Fields: fields })
    const row = await cl.getFile(TAB_CONTACTS, id)
    if (!row) throw Object.assign(new Error(`Eudonet: contact ${id} not found after update`), { statusCode: 404 })
    return transformContact(row)
  }

  // ── Companies ─────────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page  = Number(params['page'] ?? 1)
    const res   = await this.client(credentials).search(TAB_COMPANIES, {
      ShowMetadata: false,
      RowsPerPage:  limit,
      NumPage:      page,
    })
    return (res.ResultData?.Rows ?? []).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const row = await this.client(credentials).getFile(TAB_COMPANIES, id)
    if (!row) {
      throw Object.assign(new Error(`Eudonet: company ${id} not found`), { statusCode: 404 })
    }
    return transformCompany(row)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const cl     = this.client(credentials)
    const fields = untransformCompany(data)
    const fileId = await cl.create(TAB_COMPANIES, { Fields: fields })
    const row    = await cl.getFile(TAB_COMPANIES, fileId)
    if (!row) throw new Error('Eudonet: company creation returned no data')
    return transformCompany(row)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const cl     = this.client(credentials)
    const fields = untransformCompany(data)
    await cl.update(TAB_COMPANIES, id, { Fields: fields })
    const row = await cl.getFile(TAB_COMPANIES, id)
    if (!row) throw Object.assign(new Error(`Eudonet: company ${id} not found after update`), { statusCode: 404 })
    return transformCompany(row)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page  = Number(params['page'] ?? 1)
    const res   = await this.client(credentials).search(TAB_DEALS, {
      ShowMetadata: false,
      RowsPerPage:  limit,
      NumPage:      page,
    })
    return (res.ResultData?.Rows ?? []).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const row = await this.client(credentials).getFile(TAB_DEALS, id)
    if (!row) {
      throw Object.assign(new Error(`Eudonet: deal ${id} not found`), { statusCode: 404 })
    }
    return transformDeal(row)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const cl     = this.client(credentials)
    const fields = untransformDeal(data)
    const fileId = await cl.create(TAB_DEALS, { Fields: fields })
    const row    = await cl.getFile(TAB_DEALS, fileId)
    if (!row) throw new Error('Eudonet: deal creation returned no data')
    return transformDeal(row)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const cl     = this.client(credentials)
    const fields = untransformDeal(data)
    await cl.update(TAB_DEALS, id, { Fields: fields })
    const row = await cl.getFile(TAB_DEALS, id)
    if (!row) throw Object.assign(new Error(`Eudonet: deal ${id} not found after update`), { statusCode: 404 })
    return transformDeal(row)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page  = Number(params['page'] ?? 1)
    const res   = await this.client(credentials).search(TAB_NOTES, {
      ShowMetadata: false,
      RowsPerPage:  limit,
      NumPage:      page,
    })
    return (res.ResultData?.Rows ?? []).map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const row = await this.client(credentials).getFile(TAB_NOTES, id)
    if (!row) {
      throw Object.assign(new Error(`Eudonet: note ${id} not found`), { statusCode: 404 })
    }
    return transformNote(row)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const cl     = this.client(credentials)
    const fields = untransformNote(data)
    const fileId = await cl.create(TAB_NOTES, { Fields: fields })
    const row    = await cl.getFile(TAB_NOTES, fileId)
    if (!row) throw new Error('Eudonet: note creation returned no data')
    return transformNote(row)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const cl     = this.client(credentials)
    const fields = untransformNote(data)
    await cl.update(TAB_NOTES, id, { Fields: fields })
    const row = await cl.getFile(TAB_NOTES, id)
    if (!row) throw Object.assign(new Error(`Eudonet: note ${id} not found after update`), { statusCode: 404 })
    return transformNote(row)
  }
}
