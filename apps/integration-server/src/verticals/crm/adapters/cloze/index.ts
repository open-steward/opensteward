/**
 * Cloze adapter for the CRM vertical.
 *
 * Maps the Cloze REST API v1 to canonical CRM resources.
 * Docs: https://developer.cloze.com/  (Swagger UI: https://api.cloze.com/api-docs/)
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 *   API key passed as Bearer token in the Authorization header.
 *     Authorization: Bearer <api_key>
 *   The API key is generated in Cloze Pro settings under "API Keys".
 *   credentials.accessToken = api_key
 *
 * ── Pagination ───────────────────────────────────────────────────────────────
 *   Page-based pagination via `pagenumber` / `pagesize` query params.
 *   Response envelope: { errorcode: 0, people/companies/projects: [...] }
 *
 * ── Coverage ─────────────────────────────────────────────────────────────────
 *
 * Implemented (11):
 *   Contacts (People): list, get, create, update, delete
 *   Companies:         list, get, create, update, delete
 *   Deals (Projects):  list, get, create, update, delete
 *   Notes (Timeline):  create
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Notes list/get/update/delete — Cloze stores notes as timeline feed items
 *     without individual CRUD GET endpoints
 *   Activities — Cloze timeline is write-only (create communication record)
 *   Pipelines — Cloze uses stages/segments, no pipeline resource endpoint
 *   Webhooks — subscription-based (no HMAC signature verification documented)
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: activity  — Cloze timeline is write-only via /v1/timeline/content/create; no list or get endpoints exist for individual activity records.
// Unavailable: pipeline  — Cloze has no pipeline resource; projects carry a stage field, and account-level stage metadata endpoints return key/label maps only, not pipeline objects.

import { simpleApiKey } from '@opensteward/shared'

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Note } from '../../schema/note'

import { ClozeClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  transformContact,
  untransformContact,
  type RawClozePerson,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawClozeCompany,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawClozeProject,
} from './transform/deal'
import {
  transformNote,
  untransformNote,
  type RawClozeNote,
} from './transform/note'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Cloze API Key',
  helpText: 'Find your API key in Cloze Pro settings under Accounts & Services > API Key.',
})

// ── Response envelopes ────────────────────────────────────────────────────────

interface PeopleResponse {
  errorcode: number
  people?: RawClozePerson[]
  [key: string]: unknown
}

interface PersonResponse {
  errorcode: number
  person?: RawClozePerson
  [key: string]: unknown
}

interface CompaniesResponse {
  errorcode: number
  companies?: RawClozeCompany[]
  [key: string]: unknown
}

interface CompanyResponse {
  errorcode: number
  company?: RawClozeCompany
  [key: string]: unknown
}

interface ProjectsResponse {
  errorcode: number
  projects?: RawClozeProject[]
  [key: string]: unknown
}

interface ProjectResponse {
  errorcode: number
  project?: RawClozeProject
  [key: string]: unknown
}

interface NoteCreateResponse {
  errorcode: number
  uniqueid?: string
  [key: string]: unknown
}

export class ClozeAdapter implements CrmAdapter {
  // Connect Link: single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'cloze'
  readonly version = '0.1.0'

  // ── Auth ─────────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Cloze uses API key auth (not OAuth2 for private integrations).
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private client(credentials: Credentials): ClozeClient {
    return new ClozeClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pagesize: params.limit ?? DEFAULT_PAGE_SIZE,
      pagenumber: params['page'] ?? params['pagenumber'] ?? 1,
    }
  }

  // ── Contacts (People) ────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<PeopleResponse>(
      '/v1/people/find',
      this.pageParams(params),
    )
    return (res.people ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<PersonResponse>(
      '/v1/people/get',
      { uniqueid: id },
    )
    if (!res.person) {
      throw Object.assign(new Error(`Cloze: person ${id} not found`), { statusCode: 404 })
    }
    return transformContact(res.person)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    // POST /v1/people/create returns { errorcode, ... }; the created person is
    // not always returned in full — re-fetch by identifier if email is available.
    await this.client(credentials).post('/v1/people/create', body)
    const email = data.email
    if (email) {
      try {
        return await this.getContact(credentials, email)
      } catch {
        // fall through to synthetic record
      }
    }
    return {
      id: '',
      ...data,
      metadata: body,
    } as Contact
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = { ...untransformContact(data), direct: id }
    await this.client(credentials).post('/v1/people/update', body)
    return this.getContact(credentials, id)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('/v1/people/delete', { uniqueid: id })
  }

  // ── Companies ────────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const res = await this.client(credentials).get<CompaniesResponse>(
      '/v1/companies/find',
      this.pageParams(params),
    )
    return (res.companies ?? []).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<CompanyResponse>(
      '/v1/companies/get',
      { uniqueid: id },
    )
    if (!res.company) {
      throw Object.assign(new Error(`Cloze: company ${id} not found`), { statusCode: 404 })
    }
    return transformCompany(res.company)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    await this.client(credentials).post('/v1/companies/create', body)
    const domain = data.domain
    if (domain) {
      try {
        return await this.getCompany(credentials, domain)
      } catch {
        // fall through to synthetic record
      }
    }
    return {
      id: '',
      name: data.name ?? '',
      ...data,
      metadata: body,
    } as Company
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = { ...untransformCompany(data), direct: id }
    await this.client(credentials).post('/v1/companies/update', body)
    return this.getCompany(credentials, id)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('/v1/companies/delete', { uniqueid: id })
  }

  // ── Deals (Projects) ─────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const res = await this.client(credentials).get<ProjectsResponse>(
      '/v1/projects/find',
      this.pageParams(params),
    )
    return (res.projects ?? []).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<ProjectResponse>(
      '/v1/projects/get',
      { uniqueid: id },
    )
    if (!res.project) {
      throw Object.assign(new Error(`Cloze: project ${id} not found`), { statusCode: 404 })
    }
    return transformDeal(res.project)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    await this.client(credentials).post('/v1/projects/create', body)
    return {
      id: '',
      title: data.title ?? '',
      ...data,
      metadata: body,
    } as Deal
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = { ...untransformDeal(data), direct: id }
    await this.client(credentials).post('/v1/projects/update', body)
    return this.getDeal(credentials, id)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('/v1/projects/delete', { uniqueid: id })
  }

  // ── Notes ────────────────────────────────────────────────────────────────────
  // Cloze notes are timeline content records (style=note). Only create is
  // supported; list/get/update/delete are not available via a direct REST endpoint.

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<NoteCreateResponse>(
      '/v1/timeline/content/create',
      body,
    )
    // Use returned uniqueid if available, else fall back to whatever we sent
    const returnedNote: RawClozeNote = {
      ...body,
      uniqueid: res.uniqueid ?? (body.uniqueid as string | undefined),
    }
    return transformNote(returnedNote)
  }
}
