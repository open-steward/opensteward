import { pageLocally, pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
/**
 * Upsales CRM adapter for the CRM vertical.
 *
 * Maps the Upsales REST API v2 to canonical CRM resources.
 * Docs (first-party Postman collection):
 *   https://api.upsales.com/api/collections/4421023/RW87rVf1?segregateAuth=true&versionTag=latest
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   API key as the `token` query parameter on https://integration.upsales.com/api/v2
 *   ("https://integration.upsales.com/api/v2/contacts/?token={{token}}").
 *   Responses are wrapped in { data: T } for single, and
 *   { error, metadata: { total, limit, offset }, data: T[] } for lists.
 *
 * ── Paging ───────────────────────────────────────────────────────────────
 *   "The default limit is set to 1000 and the maximum limit is 2000. To
 *   retreieve the next page you use the offset -parameter in the
 *   query-string. It's value is the number of entries that you want to skip.
 *   To be 100% sure you get all entities you need sort on ID when you do the
 *   pagination." Lists send `sort=id`, `limit` and `offset`, and read the end
 *   from `metadata.total`.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *   Contacts:   list, get  (/contacts)
 *   Companies:  list, get  (/accounts, isExternal=0)
 *   Deals:      list, get  (/orders, probability 1..99 for the list)
 *   Pipelines:  list       (/orderstages folded into one synthetic pipeline)
 *   Activities: list, get  (/activities: phone calls and to-dos)
 *
 *   create/update/delete still use the pre-rebuild paths (/contact, /client,
 *   /opportunity, /activity), which the collection does not document. They
 *   were outside the read-path rebuild.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { WebhookEvent } from '../../schema/webhook'

import { UpsalesClient, type QueryValue } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawUpsalesContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawUpsalesCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawUpsalesDeal } from './transform/deal'
import { transformPipelineFromStages, type RawUpsalesStage } from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawUpsalesActivity,
} from './transform/activity'
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class UpsalesAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  /** "the maximum limit is 2000" (Pagination). */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  readonly platform = 'upsales'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
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

  private client(credentials: Credentials): UpsalesClient {
    return new UpsalesClient(credentials)
  }

  /**
   * One caller page of a documented list endpoint: `limit` clamped to the
   * documented maximum, `offset` from the caller's 1-based page, `sort=id` as
   * the Pagination section advises, and `hasMore` from `metadata.total`.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    filters: Record<string, QueryValue> = {},
  ): Promise<T[]> {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const offset = pageOffset(params, limit)
    const { items, total } = await this.client(credentials).list<T>(path, {
      ...filters,
      sort: 'id',
      limit,
      offset,
    })
    reportUpstreamPage(params, {
      ...(total !== undefined ? { totalCount: total, hasMore: offset + items.length < total } : {}),
      ...(limit < asked ? { pageSize: limit } : {}),
    })
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // "Get contact list": GET https://integration.upsales.com/api/v2/contacts/?token={{token}}
    const items = await this.listPage<RawUpsalesContact>(credentials, '/contacts/', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // "Get contact": GET https://integration.upsales.com/api/v2/contacts/{{id}}?token={{token}}
    const raw = await this.client(credentials).get<RawUpsalesContact>(
      `/contacts/${encodeURIComponent(id)}`,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawUpsalesContact>(
      '/contact',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawUpsalesContact>(
      `/contact/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contact/${id}`)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    // "Get company list": GET https://integration.upsales.com/api/v2/accounts/?token={{token}}&isExternal=0
    // ("isExternal = 0 (Find companies in your database)").
    const items = await this.listPage<RawUpsalesCompany>(credentials, '/accounts/', params, {
      isExternal: 0,
    })
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    // "Get company": GET https://integration.upsales.com/api/v2/accounts/{{id}}?token={{token}}
    const raw = await this.client(credentials).get<RawUpsalesCompany>(
      `/accounts/${encodeURIComponent(id)}`,
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawUpsalesCompany>(
      '/client',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawUpsalesCompany>(
      `/client/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/client/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    // "Get Opportunity list": GET https://integration.upsales.com/api/v2/orders?token={{token}}&probability=gte:1&probability=lte:99
    // ("Get Opportunity with probability between 1 and 99"; probability=100 is "Get Order list").
    const items = await this.listPage<RawUpsalesDeal>(credentials, '/orders', params, {
      probability: ['gte:1', 'lte:99'],
    })
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    // "Get Opportunity": GET https://integration.upsales.com/api/v2/orders/{{id}}?token={{token}}
    const raw = await this.client(credentials).get<RawUpsalesDeal>(
      `/orders/${encodeURIComponent(id)}`,
    )
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawUpsalesDeal>(
      '/opportunity',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawUpsalesDeal>(
      `/opportunity/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunity/${id}`)
  }

  // ── Pipelines (Stages as synthetic pipeline) ──────────────────────────────

  /**
   * Every stage from "Get stage list"
   * (GET https://integration.upsales.com/api/v2/orderstages?token={{token}}),
   * read at the documented maximum until `metadata.total` is reached.
   */
  private async allStages(credentials: Credentials): Promise<RawUpsalesStage[]> {
    const client = this.client(credentials)
    const stages: RawUpsalesStage[] = []
    for (;;) {
      const { items, total } = await client.list<RawUpsalesStage>('/orderstages', {
        sort: 'id',
        limit: MAX_PAGE_SIZE,
        offset: stages.length,
      })
      stages.push(...items)
      if (total === undefined && items.length === MAX_PAGE_SIZE) {
        // Without the documented total, a full page cannot be told from the last.
        throw new Error('Upsales /orderstages returned a full page without metadata.total')
      }
      if (items.length === 0 || total === undefined || stages.length >= total) return stages
    }
  }

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // One synthetic pipeline built from every stage: page 2 is empty, not a
    // second pipeline under the same id.
    const stages = await this.allStages(credentials)
    return pageLocally(stages.length === 0 ? [] : [transformPipelineFromStages(stages)], params)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    // "Get activity list": GET https://integration.upsales.com/api/v2/activities/?token={{token}}
    // (Tasks: phone calls and to-dos; appointments are a separate resource).
    const items = await this.listPage<RawUpsalesActivity>(credentials, '/activities/', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    // "Get activity": GET https://integration.upsales.com/api/v2/activities/{{id}}?token={{token}}
    const raw = await this.client(credentials).get<RawUpsalesActivity>(
      `/activities/${encodeURIComponent(id)}`,
    )
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawUpsalesActivity>(
      '/activity',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).put<RawUpsalesActivity>(
      `/activity/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/activity/${id}`)
  }
}
