/**
 * JobDiva adapter for the CRM vertical.
 *
 * Maps the JobDiva REST API (apiv2) to canonical CRM resources.
 * JobDiva is an ATS/staffing platform. Resources map as follows:
 *
 *   Candidates  → Contacts  (job seekers placed by the agency)
 *   Clients     → Companies (client companies that hire through the agency)
 *   Jobs        → Deals     (open positions / placement opportunities)
 *   Candidate notes → Notes
 *   Submittals/interviews/hires → Activities
 *
 * Docs: https://api.jobdiva.com/jobdiva-api.html
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   Three credentials are required: clientId (issued by JobDiva support),
 *   username, and password. The adapter exchanges them for a Bearer token
 *   via POST /apiv2/jobdiva/gettoken and stores the token as accessToken.
 *   The raw credentials are kept in extras so tokens can be refreshed.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts (Candidates): list, get, create
 *   Companies (Clients):   list, get
 *   Deals (Jobs):          list, get
 *   Notes:                 create
 *   Activities (Submittals): list
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Pipelines — JobDiva has no named pipeline resource in its public API
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: pipeline — JobDiva is an ATS/staffing platform; its public REST API (apiv2)
//   exposes no pipeline or stage-configuration resource. Submittal stages exist only as
//   enum values on individual submittal records, not as a queryable pipeline entity.

import { customForm } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Note } from '../../schema/note'
import type { Activity } from '../../schema/activity'

import { JobdivaClient } from './client'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'
import {
  transformContact,
  untransformContact,
  type RawJobdivaCandidate,
} from './transform/contact'
import {
  transformCompany,
  type RawJobdivaClient,
} from './transform/company'
import {
  transformDeal,
  type RawJobdivaJob,
} from './transform/deal'
import {
  transformNote,
  untransformNote,
  type RawJobdivaNote,
} from './transform/note'
import {
  transformActivity,
  type RawJobdivaActivity,
} from './transform/activity'

// ── Credential form ────────────────────────────────────────────────────────
// JobDiva requires clientId + username + password to obtain a Bearer token.

const JOBDIVA_FORM = customForm({
  fields: [
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: 'Issued by JobDiva support — contact support@jobdiva.com.',
    },
    {
      name: 'username',
      label: 'API username',
      type: 'text',
      required: true,
      helpText: 'JobDiva user with "Only allow to access JobDiva API Calls" permission.',
    },
    {
      name: 'password',
      label: 'API password',
      type: 'password',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const clientId = (fields['clientId'] ?? '').trim()
    const username = (fields['username'] ?? '').trim()
    const password = fields['password'] ?? ''
    if (!clientId || !username || !password) {
      throw new Error('JobDiva: clientId, username, and password are all required.')
    }
    const res = await fetch(`${BASE_URL}/gettoken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ clientid: clientId, username, password }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`JobDiva token exchange failed ${res.status}: ${text}`)
    }
    const json = await res.json() as { token?: string; access_token?: string; expires_in?: number }
    const token = json.token ?? json.access_token
    if (!token) throw new Error('JobDiva: token response contained no token field.')
    const expiresAt =
      typeof json.expires_in === 'number'
        ? new Date(Date.now() + json.expires_in * 1000)
        : undefined
    return {
      accessToken: token,
      expiresAt,
      // Store raw creds so refreshCredentials can re-obtain a token.
      extra: { clientId, username, password },
    }
  },
})

export class JobdivaAdapter implements CrmAdapter {
  // Connect Link — custom three-field form.
  credentialFields = JOBDIVA_FORM.credentialFields
  exchangeCredentials = JOBDIVA_FORM.exchangeCredentials

  readonly platform = 'jobdiva'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // JobDiva uses username + password, not OAuth2.
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Not used — callers go through exchangeCredentials instead.
    throw new Error('JobDiva: use exchangeCredentials (customForm), not exchangeCode.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Re-exchange using the stored raw credentials if available.
    const extra = credentials.extra as Record<string, string> | undefined
    if (!extra?.['clientId'] || !extra?.['username'] || !extra?.['password']) {
      return credentials
    }
    return JOBDIVA_FORM.exchangeCredentials(extra as Record<string, string>)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): JobdivaClient {
    return new JobdivaClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pageNumber: Number(params['page'] ?? params['pageNumber'] ?? 1),
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Contacts (Candidates) ──────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const raw = await this.client(credentials).get<RawJobdivaCandidate[]>(
      '/getNewCandidateRecords',
      this.pageParams(params),
    )
    return (raw ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawJobdivaCandidate>(
      '/getCandidateDetails',
      { candidateid: id },
    )
    if (!raw) {
      throw Object.assign(
        new Error(`JobDiva: candidate ${id} not found`),
        { statusCode: 404 },
      )
    }
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawJobdivaCandidate>(
      '/createCandidate',
      body,
    )
    return transformContact(raw)
  }

  // ── Companies (Clients) ────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const raw = await this.client(credentials).get<RawJobdivaClient[]>(
      '/getNewClientRecords',
      this.pageParams(params),
    )
    return (raw ?? []).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawJobdivaClient>(
      '/getClientDetails',
      { clientid: id },
    )
    if (!raw) {
      throw Object.assign(
        new Error(`JobDiva: client ${id} not found`),
        { statusCode: 404 },
      )
    }
    return transformCompany(raw)
  }

  // ── Deals (Jobs) ───────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const raw = await this.client(credentials).get<RawJobdivaJob[]>(
      '/getNewJobRecords',
      this.pageParams(params),
    )
    return (raw ?? []).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawJobdivaJob>(
      '/getJobDetails',
      { jobid: id },
    )
    if (!raw) {
      throw Object.assign(
        new Error(`JobDiva: job ${id} not found`),
        { statusCode: 404 },
      )
    }
    return transformDeal(raw)
  }

  // ── Notes (Candidate Notes) ────────────────────────────────────────────────

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const raw = await this.client(credentials).post<RawJobdivaNote>(
      '/createCandidateNote',
      body,
    )
    return transformNote(raw)
  }

  // ── Activities (Submittals / Interviews / Hires) ───────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const raw = await this.client(credentials).get<RawJobdivaActivity[]>(
      '/getNewSubmittalInterviewHireActivityRecords',
      this.pageParams(params),
    )
    return (raw ?? []).map(transformActivity)
  }
}
