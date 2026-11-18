/**
 * Corefactors (Teleduce) adapter for the CRM vertical.
 *
 * Maps the Corefactors Teleduce REST API to canonical CRM resources.
 * Docs: https://www.corefactors.ai/blog/teleduce-list-management-api/
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   Single API key provisioned by the Corefactors team. The key is embedded
 *   directly in the URL path rather than an HTTP header:
 *     https://teleduce.corefactors.in/leadapi/<api_key>/
 *
 *   credentials.accessToken = API key
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (4):
 *   Contacts (leads): list, get, create, update
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Companies, Deals, Pipelines, Notes, Activities
 *   (Corefactors only publishes a Lead API and List Management API; no public
 *   REST endpoints for these resources were found in any accessible docs.)
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unverified: activity  — no public REST endpoint found in accessible docs
 * Unverified: company   — no public REST endpoint found in accessible docs
 * Unverified: deal      — no public REST endpoint found in accessible docs
 * Unverified: note      — no public REST endpoint found in accessible docs
 * Unverified: pipeline  — no public REST endpoint found in accessible docs
 */

import { simpleApiKey } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'

import { CorefactorsClient } from './client'
import { DEFAULT_PAGE_SIZE, LEAD_API_PATH } from './constants'
import {
  transformContact,
  untransformContact,
  type RawCorefactorsContact,
} from './transform/contact'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  placeholder: 'Paste your Corefactors API key',
  helpText: 'Found under Settings → Integrations → Lead API in your Corefactors account.',
})

export class CorefactorsAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'corefactors'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Corefactors uses a static API key — no OAuth2 redirect.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For non-OAuth flows the Connect Link passes the API key as `code`.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire.
    return credentials
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): CorefactorsClient {
    return new CorefactorsClient(credentials)
  }

  // ── Contacts (Leads) ──────────────────────────────────────────────────────
  //
  // Corefactors exposes leads via:
  //   GET  /leadapi/:apiKey/?page=N&per_page=N   — list (paginated)
  //   GET  /leadapi/:apiKey/:id/                 — fetch single
  //   POST /leadapi/:apiKey/                     — create
  //   PUT  /leadapi/:apiKey/:id/                 — update

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = Number(params['page'] ?? 1)
    const raw = await this.client(credentials).get<RawCorefactorsContact[] | { data?: RawCorefactorsContact[]; results?: RawCorefactorsContact[] }>(
      `${LEAD_API_PATH}/:apiKey/`,
      { page, per_page: limit },
    )
    const items: RawCorefactorsContact[] = Array.isArray(raw)
      ? raw
      : ((raw as { data?: RawCorefactorsContact[]; results?: RawCorefactorsContact[] }).data ??
          (raw as { data?: RawCorefactorsContact[]; results?: RawCorefactorsContact[] }).results ??
          [])
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawCorefactorsContact>(
      `${LEAD_API_PATH}/:apiKey/${encodeURIComponent(id)}/`,
    )
    if (!raw || !raw.id) {
      throw Object.assign(
        new Error(`Corefactors: contact ${id} not found`),
        { statusCode: 404 },
      )
    }
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawCorefactorsContact>(
      `${LEAD_API_PATH}/:apiKey/`,
      body,
    )
    if (!raw) {
      throw new Error('Corefactors: contact creation returned no data')
    }
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).put<RawCorefactorsContact>(
      `${LEAD_API_PATH}/:apiKey/${encodeURIComponent(id)}/`,
      body,
    )
    if (!raw) {
      throw new Error('Corefactors: contact update returned no data')
    }
    return transformContact(raw)
  }
}
