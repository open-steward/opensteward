/**
 * Catalyst adapter for the CRM vertical.
 *
 * Maps the Catalyst Software REST API v1 to canonical CRM resources.
 * Docs: https://help.catalyst.io/hc/en-us/articles/34021477455508-Catalyst-API-v1
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 *   API key generated in Catalyst under Settings > API Keys ("Manage API keys"
 *   article). credentials.accessToken = api key. The client sends it in an
 *   `X-Api-Key` header; no public first-party page names the header (the
 *   OpenAPI spec at https://app.catalyst.io/public-apis is behind a login), so
 *   the header name is UNVERIFIED.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Companies (Accounts): list (GET /accounts), get (GET /accounts/{account_id}).
 *   The paths, base URL and limit/offset are documented. The response envelope
 *   and account field names are NOT publicly documented (spec behind login):
 *   listCompanies reads `data` and throws 502 rather than report an empty,
 *   complete collection when that array is absent.
 *   Companies (Accounts): create, update — not in the public docs (see below)
 *
 * Refused with 501 NOT_SUPPORTED before any request:
 *   Contacts: list, get. The article's endpoint tables list /accounts, /emails,
 *   /health_scores, /notes, /playbooks, /tasks and /unsubscribed only; there
 *   is no contact endpoint.
 *
 * Left as they were, and undocumented: createContact, updateContact
 * (POST/PATCH /contacts), createCompany, updateCompany (POST/PATCH /accounts).
 * The article describes a read-only API "for viewing customer business data"
 * and lists only GET endpoints.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unavailable: deal     — Catalyst is a customer success platform; deal/opportunity
 *                         pipeline management is not exposed in the external API v1.
 * Unavailable: pipeline — No pipeline configuration endpoint exists in the external API v1.
 * Not implemented: note, activity — the article documents "List notes GET /notes",
 *   "Show notes GET /notes/{note_id}", "List tasks GET /tasks" and "Show task
 *   GET /tasks/{task_id}" with limit/offset, but their response fields are only
 *   in the login-gated spec. The registry returns 501 for them.
 * Webhooks — Catalyst does not document a webhook signature scheme in v1.
 *
 * ── Pagination ────────────────────────────────────────────────────────────────
 *   limit  (default 25, max 100)
 *   offset (default 0)
 *   Rate limit: 100 calls/min per customer instance.
 */

import { pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'

import { CatalystClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawCatalystContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawCatalystAccount } from './transform/company'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText: 'Generate your API key in Catalyst under Settings > API Keys.',
  placeholder: 'catalyst_live_...',
})

export class CatalystAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'catalyst'
  readonly version = '0.1.0'

  /** Documented for /accounts: "limit → Max number of records to return (default 25, max 100)". */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Catalyst uses API keys, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes the API key as `code`.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire; nothing to refresh.
    return credentials
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): CatalystClient {
    return new CatalystClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  /**
   * Refused before any request. The "Catalyst API v1" article's endpoint
   * tables ("Accounts", "Playbook Email", "Health Scores", "Notes",
   * "Playbooks", "Tasks", "Unsubscribed Emails") document no contact path.
   */
  async listContacts(_credentials: Credentials, _params: QueryParams): Promise<Contact[]> {
    throw Object.assign(
      new Error(
        'Catalyst cannot list contacts: the Catalyst API v1 documents only /accounts, /emails, /health_scores, /notes, /playbooks, /tasks and /unsubscribed endpoints, and no contact endpoint',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  /** Refused before any request, for the same reason as listContacts. */
  async getContact(_credentials: Credentials, _id: string): Promise<Contact> {
    throw Object.assign(
      new Error(
        'Catalyst cannot read contacts: the Catalyst API v1 documents only /accounts, /emails, /health_scores, /notes, /playbooks, /tasks and /unsubscribed endpoints, and no contact endpoint',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawCatalystContact>('/contacts', body)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).patch<RawCatalystContact>(`/contacts/${id}`, body)
    return transformContact(raw)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  /**
   * One caller page of GET /accounts. Documented: "limit → Max number of
   * records to return (default 25, max 100)" and "offset → Offset for
   * pagination (default 0)". The response envelope is not publicly
   * documented, so a short page is the end of the collection, and a body
   * without a `data` array is an error, never an empty last page (which the
   * sync would take as a complete, empty collection and drop its cache).
   */
  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const requested = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Math.max(1, Math.min(Math.floor(requested), MAX_PAGE_SIZE))
    const offset = pageOffset(params, limit)
    const res = await this.client(credentials).list<RawCatalystAccount>('/accounts', {
      limit,
      offset,
    })
    if (!Array.isArray(res?.data)) {
      throw Object.assign(
        new Error('Catalyst GET /accounts returned a body without a `data` array'),
        { statusCode: 502, code: 'UPSTREAM_ERROR' },
      )
    }
    const rows = res.data
    reportUpstreamPage(params, {
      hasMore: rows.length >= limit,
      ...(limit < requested ? { pageSize: limit } : {}),
    })
    return rows.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawCatalystAccount>(`/accounts/${id}`)
    if (!raw) {
      throw Object.assign(new Error(`Catalyst: account ${id} not found`), { statusCode: 404 })
    }
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawCatalystAccount>('/accounts', body)
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).patch<RawCatalystAccount>(`/accounts/${id}`, body)
    return transformCompany(raw)
  }
}
