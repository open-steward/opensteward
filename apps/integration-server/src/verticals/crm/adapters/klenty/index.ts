/**
 * Klenty adapter for the CRM vertical.
 *
 * Maps the Klenty REST API v1 to canonical CRM resources.
 * Klenty is a sales-engagement platform — its core resource is the Prospect
 * (mapped to Contact). Companies, Deals, Pipelines, Activities, and Notes are
 * not available via the Klenty public API and return HTTP 501 automatically.
 *
 * Docs: https://support.klenty.com/en/articles/3197537-getting-started-with-klenty-api
 *
 * ── Auth ────────────────────────────────────────────────────────────────────
 *   API key passed in the `x-API-key` request header.
 *   The account username (email) is required as part of every URL path and is
 *   stored in credentials.extra.username.
 *
 *   credentials.accessToken = API key
 *   credentials.extra.username = account email / username
 *
 * ── Coverage ─────────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   contact — list, get, create, update
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: activity  — no activity endpoint in the Klenty public API; call logs exist at /calls but do not map to the canonical Activity schema
 * Unavailable: company   — no company endpoint; company data is Prospect-level fields only (Company, CompanyDomain, CompanyPhone)
 * Unavailable: deal      — no deal endpoint; Klenty is a sequencing/sales-engagement platform and does not manage opportunities
 * Unavailable: note      — no note endpoint; notes are not a resource exposed by the Klenty API
 * Unavailable: pipeline  — no pipeline endpoint; Klenty uses cadences (email/call sequences), not deal pipelines
 */

import { customForm, reportUpstreamPage } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { WebhookEvent } from '../../schema/webhook'

import { KlentyClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawKlentyProspect,
} from './transform/contact'

const KLENTY_FORM = customForm({
  fields: [
    {
      name: 'username',
      label: 'Account email (username)',
      type: 'text',
      placeholder: 'you@example.com',
      helpText: 'The email address you use to log in to Klenty.',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      helpText: 'Generate from Klenty → Settings → API key.',
      required: true,
    },
  ],
  async exchange(fields) {
    const username = (fields['username'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!username) throw new Error('Account email is required.')
    if (!apiKey) throw new Error('API key is required.')
    return {
      accessToken: apiKey,
      extra: { username },
    }
  },
})

export class KlentyAdapter implements CrmAdapter {
  readonly platform = 'klenty'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Connect Link — custom form (API key + username) ──────────────────────

  credentialFields = KLENTY_FORM.credentialFields
  exchangeCredentials = KLENTY_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Klenty uses API key auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes apiKey as code; username must be in the extra field
    // supplied via exchangeCredentials (above) in normal flows.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire.
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private client(credentials: Credentials): KlentyClient {
    return new KlentyClient(credentials)
  }

  // ── Contacts (Prospects) ──────────────────────────────────────────────────

  /**
   * List prospects.
   * Supports optional params: startDate / endDate (yyyy/mm/dd), listName.
   *
   * Klenty's `start` is a 1-based page index scaled by `limit`, not a row
   * offset: "start=2 & limit=10 ... fetches your record from 11 to 20. You can
   * fetch up to 1000 records in a request."
   * (https://support.klenty.com/en/articles/8193357-klenty-s-get-api-s)
   * The response is a bare array with no next signal, so a short page is the last.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const start = params.page ?? 1

    const queryParams: Record<string, string | number | undefined> = {
      limit,
      start,
    }
    if (params['startDate']) queryParams['startDate'] = String(params['startDate'])
    if (params['endDate']) queryParams['endDate'] = String(params['endDate'])
    if (params['lastUpdatedDateStart']) queryParams['lastUpdatedDateStart'] = String(params['lastUpdatedDateStart'])
    if (params['lastUpdatedDateEnd']) queryParams['lastUpdatedDateEnd'] = String(params['lastUpdatedDateEnd'])
    if (params['listName']) queryParams['listName'] = String(params['listName'])

    const raw = await this.client(credentials).get<RawKlentyProspect[]>('/prospects', queryParams)
    const rows = raw ?? []
    reportUpstreamPage(params, { hasMore: rows.length >= limit, pageSize: limit })
    return rows.map(transformContact)
  }

  /**
   * Get a single prospect by email address.
   * In Klenty the email IS the lookup key; `id` is the email address.
   */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawKlentyProspect>(`/${encodeURIComponent(id)}`)
    if (!raw || (!raw.id && !raw.Email)) {
      throw Object.assign(new Error(`Klenty: prospect ${id} not found`), { statusCode: 404 })
    }
    return transformContact(raw)
  }

  /**
   * Create a prospect.
   */
  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    // Klenty returns { status: true } on success; re-fetch to get full record.
    await this.client(credentials).post<{ status: boolean }>('/prospects', body)
    const email = data.email ?? (body['Email'] as string | undefined)
    if (!email) {
      // Return a synthetic contact when no email was provided (should not happen).
      return transformContact(body as RawKlentyProspect)
    }
    return this.getContact(credentials, email)
  }

  /**
   * Update a prospect by email (the natural key).
   * `id` is the prospect's email address.
   */
  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    await this.client(credentials).post<{ status: boolean }>(
      `/prospects/${encodeURIComponent(id)}`,
      body,
    )
    // Re-fetch to return the updated record.
    return this.getContact(credentials, id)
  }
}
