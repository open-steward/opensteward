import { simpleApiKey } from '@opensteward/shared'
/**
 * Recruiterflow adapter for the CRM vertical.
 *
 * Maps the Recruiterflow external API to canonical CRM resources.
 * Docs: https://recruiterflow.com/api (Swagger / Flasgger)
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   RF-Api-Key header on every request.
 *   credentials.accessToken = API key
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (9):
 *   Contacts:   list, get, create   (Recruiterflow "Candidates")
 *   Companies:  list, get, create   (Recruiterflow "Clients")
 *   Activities: list                (Recruiterflow candidate activities)
 *   Notes:      create              (Recruiterflow candidate notes)
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Deals, Pipelines (not natively exposed in the external API)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { RecruiterflowClient } from './client'
import { DEFAULT_PAGE_SIZE, PATHS } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawRecruiterflowContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawRecruiterflowCompany,
} from './transform/company'
import {
  transformActivity,
  type RawRecruiterflowActivity,
} from './transform/activity'
import {
  transformNote,
  untransformNote,
  type RawRecruiterflowNote,
} from './transform/note'

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class RecruiterflowAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'recruiterflow'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Recruiterflow uses API key auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes the RF API key as `code`.
    return { accessToken: code }
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

  private client(credentials: Credentials): RecruiterflowClient {
    return new RecruiterflowClient(credentials)
  }

  // ── Contacts (Candidates) ─────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = Number(params['page'] ?? 1)
    const raw = await this.client(credentials).list<RawRecruiterflowContact>(
      PATHS.CANDIDATE_LIST,
      page,
      limit,
    )
    return raw.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawRecruiterflowContact>(
      PATHS.CANDIDATE_GET,
      id,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawRecruiterflowContact>(
      PATHS.CANDIDATE_ADD,
      body,
    )
    return transformContact(raw)
  }

  // ── Companies (Clients) ───────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = Number(params['page'] ?? 1)
    const raw = await this.client(credentials).list<RawRecruiterflowCompany>(
      PATHS.CLIENT_LIST,
      page,
      limit,
    )
    return raw.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawRecruiterflowCompany>(
      PATHS.CLIENT_GET,
      id,
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawRecruiterflowCompany>(
      PATHS.CLIENT_ADD,
      body,
    )
    return transformCompany(raw)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = Number(params['page'] ?? 1)
    const raw = await this.client(credentials).list<RawRecruiterflowActivity>(
      PATHS.CANDIDATE_ACTIVITY_LIST,
      page,
      limit,
    )
    return raw.map(transformActivity)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const raw = await this.client(credentials).post<RawRecruiterflowNote>(
      PATHS.CANDIDATE_NOTES_ADD,
      body,
    )
    return transformNote(raw)
  }
}
