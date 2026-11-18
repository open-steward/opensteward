/**
 * cobra CRM Cloud (cobra GmbH) adapter for the CRM vertical.
 *
 * Docs: https://apis.cobra-hilfe.de (index: https://apis.cobra-hilfe.de/llms.txt).
 * Host: https://api.cobra.de/v1 (see ./constants). Auth: an email + API key
 * exchanged at POST /auth/token for a one-hour bearer token, plus the
 * X-Integration-Name, X-Integration-Provider and X-Cobra-TenantId headers on
 * every request (see ./auth and ./client).
 *
 * cobra serves lists through GraphQL: "combining GraphQL for list queries and
 * REST for other operations" (https://apis.cobra-hilfe.de/doc-415975.md). Its
 * GraphQL schemas are published only by server introspection, which needs an
 * authenticated tenant, so no list is built on them here. The one documented
 * REST list is GET /people.
 *
 * Write methods (create/update/delete) were not rebuilt and still call
 * placeholder paths (/contacts, /companies, /deals, /activities, /notes).
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { CredentialField } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { CobraCrmClient } from './client'
import { COBRA_CREDENTIAL_FIELDS, exchangeCobraCredentials, refreshCobraCredentials } from './auth'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawCobraCrmContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawCobraCrmCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawCobraCrmDeal } from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawCobraCrmActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawCobraCrmNote } from './transform/note'
import {
  transformPeopleListItem,
  transformPerson,
  type RawCobraPeopleListItem,
  type RawCobraPerson,
} from './transform/person'
import { transformCompanyDetail, type RawCobraCompanyDetail } from './transform/company-detail'
import { transformTouchpoint, type RawCobraTouchpoint } from './transform/touchpoint'

export interface CobraCrmAdapterConfig {
  apiKey?: string
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** Why cobra's companies and touchpoints have no list here. */
const GRAPHQL_ONLY =
  'cobra serves "GraphQL for list queries and REST for other operations" (https://apis.cobra-hilfe.de/doc-415975.md), ' +
  'and publishes that GraphQL schema only through authenticated server introspection, not in its API docs'

/** No deal, opportunity or pipeline resource anywhere in the cobra API index. */
const NO_SALES_RESOURCE =
  'the cobra API index (https://apis.cobra-hilfe.de/llms.txt) documents no deal, opportunity, sales-stage or pipeline resource'

/** Notes are one field on a person or company, never a collection of their own. */
const NOTE_IS_A_FIELD =
  'cobra notes are a single field on a person or company ("Update a person\'s note", ' +
  '"Update the note on a company by its ID"); there is no note collection and no note id'

export class CobraCrmAdapter implements CrmAdapter {
  readonly platform = 'cobra-crm'
  readonly version = '0.2.0'

  constructor(_config: CobraCrmAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  /** Email + API key + tenant id, exchanged at POST /auth/token (./auth). */
  credentialFields(): CredentialField[] {
    return COBRA_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeCobraCredentials(fields)
  }

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('cobra CRM: connect with an API user email, API key and tenant id')
  }

  /** The bearer token lasts an hour and comes with no refresh token: re-run the grant. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCobraCredentials(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private c(creds: Credentials): CobraCrmClient {
    return new CobraCrmClient(creds)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  /**
   * GET /people, "Retrieve a list of people" (https://apis.cobra-hilfe.de/api-7858747.md).
   * It declares no query parameters at all (only the integration, tenant and
   * Accept-Language headers), so it answers with the whole collection, paged
   * here with pageLocally. Its envelope's `metaData.totalResults` is checked
   * against the rows returned: pageLocally reports the rows as the complete
   * collection, so a short or uncounted answer is an error, not a last page.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.c(credentials).getEnvelope<RawCobraPeopleListItem[]>('/people')
    const rows = res.data
    if (!Array.isArray(rows)) {
      throw Object.assign(new Error('cobra CRM: GET /people returned no data array'), {
        statusCode: 502,
      })
    }
    const total = res.metaData?.totalResults
    if (typeof total !== 'number' || total !== rows.length) {
      throw Object.assign(
        new Error(
          `cobra CRM: GET /people returned ${rows.length} people but metaData.totalResults is ${String(total)}; ` +
            'the endpoint documents no paging parameters, so the rest cannot be reached',
        ),
        { statusCode: 502 },
      )
    }
    return pageLocally(rows, params).map(transformPeopleListItem)
  }

  /** GET /people/{id}, "Retrieve a person" (https://apis.cobra-hilfe.de/api-7858749.md). */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.c(credentials).getData<RawCobraPerson>(
      `/people/${encodeURIComponent(id)}`,
    )
    return transformPerson(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    // Not rebuilt: placeholder path; cobra documents POST /people (api-7858748).
    const raw = await this.c(credentials).post<RawCobraCrmContact>(
      '/contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    // Not rebuilt: placeholder path; cobra documents an update at /people/{id} (api-7858750).
    const raw = await this.c(credentials).put<RawCobraCrmContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    // Not rebuilt: placeholder path; cobra documents a delete at /people/{id} (api-7858751).
    await this.c(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(_credentials: Credentials, _params: QueryParams): Promise<Company[]> {
    throw notSupported(
      `cobra CRM cannot list companies: no REST list of companies is documented, only ` +
        `https://api.cobra.de/v1/crm/companies/graphql; ${GRAPHQL_ONLY}`,
    )
  }

  /**
   * GET /companies/{id}, "Retrieve the details of an existing company by its ID"
   * (https://apis.cobra-hilfe.de/api-7858725.md).
   */
  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.c(credentials).getData<RawCobraCompanyDetail>(
      `/companies/${encodeURIComponent(id)}`,
    )
    return transformCompanyDetail(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    // Not rebuilt: request/response shapes are placeholders.
    const raw = await this.c(credentials).post<RawCobraCrmCompany>(
      '/companies',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    // Not rebuilt: request/response shapes are placeholders.
    const raw = await this.c(credentials).put<RawCobraCrmCompany>(
      `/companies/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/companies/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    throw notSupported(`cobra CRM cannot list deals: ${NO_SALES_RESOURCE}`)
  }

  async getDeal(_credentials: Credentials, _id: string): Promise<Deal> {
    throw notSupported(`cobra CRM cannot read deals: ${NO_SALES_RESOURCE}`)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    // Not rebuilt: fabricated path (no deal resource is documented).
    const raw = await this.c(credentials).post<RawCobraCrmDeal>('/deals', untransformDeal(data))
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    // Not rebuilt: fabricated path (no deal resource is documented).
    const raw = await this.c(credentials).put<RawCobraCrmDeal>(
      `/deals/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    // Not rebuilt: fabricated path (no deal resource is documented).
    await this.c(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw notSupported(`cobra CRM cannot list pipelines: ${NO_SALES_RESOURCE}`)
  }

  async getPipeline(_credentials: Credentials, _id: string): Promise<Pipeline> {
    throw notSupported(`cobra CRM cannot read pipelines: ${NO_SALES_RESOURCE}`)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(_credentials: Credentials, _params: QueryParams): Promise<Activity[]> {
    throw notSupported(
      `cobra CRM cannot list activities (touchpoints): no REST list of touchpoints is documented, only ` +
        `https://api.cobra.de/v1/crm/touchpoints/graphql; ${GRAPHQL_ONLY}`,
    )
  }

  /**
   * GET /touchpoints/{id}, "Retrieve the details of an existing touchpoint by
   * its ID" (https://apis.cobra-hilfe.de/api-7858744.md).
   */
  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.c(credentials).getData<RawCobraTouchpoint>(
      `/touchpoints/${encodeURIComponent(id)}`,
    )
    return transformTouchpoint(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    // Not rebuilt: placeholder path; cobra documents "Create a new touchpoint" (api-7858797).
    const raw = await this.c(credentials).post<RawCobraCrmActivity>(
      '/activities',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    // Not rebuilt: placeholder path; cobra documents a touchpoint update (api-7858798).
    const raw = await this.c(credentials).put<RawCobraCrmActivity>(
      `/activities/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    // Not rebuilt: placeholder path; cobra documents a touchpoint delete (api-7858799).
    await this.c(credentials).delete(`/activities/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notSupported(`cobra CRM cannot list notes: ${NOTE_IS_A_FIELD}`)
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw notSupported(`cobra CRM cannot read notes by id: ${NOTE_IS_A_FIELD}`)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    // Not rebuilt: fabricated path (no note collection is documented).
    const raw = await this.c(credentials).post<RawCobraCrmNote>('/notes', untransformNote(data))
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    // Not rebuilt: fabricated path (no note collection is documented).
    const raw = await this.c(credentials).put<RawCobraCrmNote>(
      `/notes/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    // Not rebuilt: fabricated path (no note collection is documented).
    await this.c(credentials).delete(`/notes/${id}`)
  }
}
