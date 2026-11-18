import {
  connectionScope,
  cursorPagerKey,
  customForm,
  DEFAULT_PAGE_LIMIT,
  pageByRows,
  type CredentialField,
} from '@opensteward/shared'
/**
 * ForceManager (now Sage Sales Management) adapter for the CRM vertical.
 *
 * Docs: https://developer.forcemanager.com/ (OpenAPI 3.0.3 at
 * https://developer.forcemanager.com/openapi.json).
 *
 * Auth: the public and private API keys are exchanged for a session token at
 * `POST /login` (see client.ts); the token goes in `X-Session-Key`.
 * Base URL: https://api.forcemanager.com/api/v4 (Production).
 *
 * Paging: every list is `?page=` (0-based) plus a page-size header, and ends
 * with `[]`. No page-size maximum is documented, so `maxPageSize` is unset.
 * Lists page through `pageByRows`, which peeks at the next upstream page on
 * a page boundary so `hasMore` is exact.
 *
 *   Contacts → GET /contacts, /contacts/{ID}
 *   Companies → GET /accounts, /accounts/{ID}
 *   Deals → GET /opportunities, /opportunities/{ID} (+ GET /currencies for ISO codes)
 *   Pipelines → GET /opportunityTypes, with stages from GET /opportunityStatuses
 *   Activities → GET /activities, /activities/{ID}
 *   Notes → not in the API: listNotes / getNote refuse with 501.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { ForceManagerClient, keysFrom } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawForceManagerContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawForceManagerAccount,
} from './transform/company'
import { transformDeal, untransformDeal, type RawForceManagerOpportunity } from './transform/deal'
import {
  transformPipeline,
  type RawForceManagerOpportunityStatus,
  type RawForceManagerOpportunityType,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawForceManagerActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawForceManagerNote } from './transform/note'

export interface ForceManagerAdapterConfig {
  apiKey?: string
}

const FORCEMANAGER_FIELDS: CredentialField[] = [
  {
    name: 'publicKey',
    label: 'Public API key',
    type: 'text',
    required: true,
    helpText:
      'Settings > Integrations > API key in Sage Sales Management, or the ForceAdmin Password section.',
  },
  {
    name: 'privateKey',
    label: 'Private API key',
    type: 'password',
    required: true,
    helpText: 'The private key issued with the public key.',
  },
]

const CREDENTIAL_FORM = customForm({
  fields: FORCEMANAGER_FIELDS,
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const publicKey = input['publicKey']?.trim() ?? ''
    const privateKey = input['privateKey']?.trim() ?? ''
    if (!publicKey) throw new Error('Public API key is required.')
    if (!privateKey) throw new Error('Private API key is required.')
    return { accessToken: publicKey, extra: { privateKey } }
  },
})

/** Where a Notes resource would be: the vendor's 150 documented paths have none. */
function notesUnsupported(what: 'list' | 'read'): never {
  throw Object.assign(
    new Error(
      `ForceManager cannot ${what} notes: the v4 API (https://developer.forcemanager.com/openapi.json) documents no notes resource`,
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

interface RawForceManagerCurrency {
  id?: number | string | null
  isoCode?: string | null
}

export class ForceManagerAdapter implements CrmAdapter {
  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'forcemanager'
  readonly version = '0.2.0'

  constructor(_config: ForceManagerAdapterConfig = {}) {}

  // ── Auth (API key pair → session token; no OAuth flow) ────────────────────

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

  private client(credentials: Credentials): ForceManagerClient {
    return new ForceManagerClient(keysFrom(credentials))
  }

  /**
   * The caller's page of `path`: upstream pages are asked for at the caller's
   * limit (`Count`), and `pageByRows` cuts the caller's rows out of them, so
   * rows are served once even if the platform sized a page differently. The
   * chain ends at the documented `[]`.
   */
  private async listRows<T>(
    client: ForceManagerClient,
    credentials: Credentials,
    params: QueryParams,
    path: string,
  ): Promise<T[]> {
    const count = Math.floor(Number(params.limit ?? DEFAULT_PAGE_LIMIT))
    const key = cursorPagerKey(connectionScope('forcemanager', credentials), path, { count })
    const { items } = await pageByRows<T, number>(key, params, async (cursor) => {
      const page = cursor ?? 0
      const rows = await client.page<T>(path, page, count)
      return { items: rows, next: rows.length === 0 ? null : page + 1 }
    })
    return items
  }

  /** currencyId.id → ISO 4217 code, from GET /currencies (`isoCode`, e.g. "eur"). */
  private async currencyCodes(client: ForceManagerClient): Promise<Map<string, string>> {
    const rows = await client.all<RawForceManagerCurrency>('/currencies')
    const codes = new Map<string, string>()
    for (const row of rows) {
      const iso = typeof row.isoCode === 'string' ? row.isoCode.toUpperCase() : ''
      if (row.id != null && /^[A-Z]{3}$/.test(iso)) codes.set(String(row.id), iso)
    }
    return codes
  }

  private async dealsWithCurrency(
    client: ForceManagerClient,
    raws: RawForceManagerOpportunity[],
  ): Promise<Deal[]> {
    const needs = raws.some((r) => r.currencyId?.id != null && typeof r.total === 'number')
    const codes = needs ? await this.currencyCodes(client) : new Map<string, string>()
    return raws.map((r) =>
      transformDeal(r, r.currencyId?.id != null ? codes.get(String(r.currencyId.id)) : undefined),
    )
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.listRows<RawForceManagerContact>(
      this.client(credentials),
      credentials,
      params,
      '/contacts',
    )
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawForceManagerContact>(
      `/contacts/${encodeURIComponent(id)}`,
    )
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawForceManagerContact>('/contacts', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawForceManagerContact>(`/contacts/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const rows = await this.listRows<RawForceManagerAccount>(
      this.client(credentials),
      credentials,
      params,
      '/accounts',
    )
    return rows.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawForceManagerAccount>(
      `/accounts/${encodeURIComponent(id)}`,
    )
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawForceManagerAccount>('/accounts', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawForceManagerAccount>(`/accounts/${id}`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/accounts/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const client = this.client(credentials)
    const rows = await this.listRows<RawForceManagerOpportunity>(
      client,
      credentials,
      params,
      '/opportunities',
    )
    return this.dealsWithCurrency(client, rows)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const client = this.client(credentials)
    const res = await client.get<RawForceManagerOpportunity>(
      `/opportunities/${encodeURIComponent(id)}`,
    )
    const [deal] = await this.dealsWithCurrency(client, [res])
    return deal!
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawForceManagerOpportunity>(
      '/opportunities',
      body,
    )
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawForceManagerOpportunity>(
      `/opportunities/${id}`,
      body,
    )
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * Pipelines are Opportunity Types, paged like any list; each carries the
   * Opportunity Statuses whose `idParent` is its id, from one full walk of
   * GET /opportunityStatuses (see transform/pipeline.ts).
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const client = this.client(credentials)
    const types = await this.listRows<RawForceManagerOpportunityType>(
      client,
      credentials,
      params,
      '/opportunityTypes',
    )
    if (types.length === 0) return []
    const statuses = await client.all<RawForceManagerOpportunityStatus>('/opportunityStatuses')
    return types.map((t) => transformPipeline(t, statuses))
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const rows = await this.listRows<RawForceManagerActivity>(
      this.client(credentials),
      credentials,
      params,
      '/activities',
    )
    return rows.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawForceManagerActivity>(
      `/activities/${encodeURIComponent(id)}`,
    )
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawForceManagerActivity>('/activities', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    return notesUnsupported('list')
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    return notesUnsupported('read')
  }

  // Write method, out of this rebuild's scope: POST /notes is not a documented path.
  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawForceManagerNote>('/notes', body)
    return transformNote(res)
  }
}
