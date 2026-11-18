import {
  customForm,
  pageByCursor,
  cursorPagerKey,
  connectionScope,
  reportUpstreamPage,
} from '@opensteward/shared'
/**
 * Lime CRM adapter for the CRM vertical.
 *
 * Maps the Lime CRM REST API to canonical CRM resources.
 * Docs: https://docs.lime-crm.com/
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   API key in the `x-api-key` header: "The key must be sent as the value of
 *   a header named `x-api-key` in every request."
 *   (http://static.lime-crm.com/crm-api-docs/spec/limeobject). The tenant base
 *   URL, "https://<yourdomain>/<application>/api/v1"
 *   (https://docs.lime-crm.com/integration/rest-apis/start), is collected on
 *   the connect form and stored in credentials.extra.instanceUrl.
 *
 * ── API format ───────────────────────────────────────────────────────────
 *   HAL format responses for lists: { _embedded: { limeobjects: [...] } }
 *   Lime uses trailing slashes on all endpoints.
 *   Pagination: `_limit` (max 50) on page 1, then the HAL `_links.next.href`.
 *   IDs are prefixed with underscore: _id.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (12):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get
 *
 * Refused (501 NOT_SUPPORTED, before any request):
 *   Pipelines:  list. The documented APIs have no dealstatus collection;
 *               dealstatus is an option property on deal.
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Deals create/update/delete (status-driven workflow, skipped)
 *   Notes, Activities (skip per spec)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { WebhookEvent } from '../../schema/webhook'

import { LimeCrmClient, normaliseInstanceUrl } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawLimeCrmPerson } from './transform/contact'
import { transformCompany, untransformCompany, type RawLimeCrmCompany } from './transform/company'
import { transformDeal, type RawLimeCrmDeal } from './transform/deal'

/** The API key plus the application's own base URL (see LimeCrmClient). */
const LIME_CRM_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      helpText: 'Created in Lime Admin or LISA for a user of type API.',
      required: true,
    },
    {
      name: 'instanceUrl',
      label: 'Lime CRM instance URL',
      type: 'text',
      placeholder: 'https://lime.example.com/Lime%20CRM/api/v1',
      helpText: "Your application's API base: https://<yourdomain>/<application>/api/v1",
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const rawUrl = (fields['instanceUrl'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    if (!rawUrl) throw new Error('Lime CRM instance URL is required.')
    return { accessToken: apiKey, extra: { instanceUrl: normaliseInstanceUrl(rawUrl) } }
  },
})

export class LimeCrmAdapter implements CrmAdapter {
  // Connect Link support — API key plus the application's base URL.

  credentialFields = LIME_CRM_FORM.credentialFields

  exchangeCredentials = LIME_CRM_FORM.exchangeCredentials

  readonly platform = 'lime-crm'
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

  private client(credentials: Credentials): LimeCrmClient {
    return new LimeCrmClient(credentials)
  }

  /**
   * One caller page of a limeobject collection. Lime pages by link: "The
   * following next object page can be retrieved by following the `next` link
   * provided in the response." `_limit` is documented with "maximum: 50", so a
   * larger limit is clamped and the smaller size reported as `pageSize`.
   */
  private async listCollection<T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const key = cursorPagerKey(
      connectionScope(`lime-crm:${client.instanceUrl}`, credentials),
      path,
      { limit },
    )
    const { items, hasMore } = await pageByCursor<T>(key, params.page, (cursor) =>
      client.listPage<T>(path, { _limit: limit }, cursor),
    )
    reportUpstreamPage(params, {
      hasMore,
      ...(params.limit !== undefined && limit < params.limit ? { pageSize: limit } : {}),
    })
    return items
  }

  // ── Contacts (Persons) ────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listCollection<RawLimeCrmPerson>(
      credentials,
      params,
      '/limeobject/person/',
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawLimeCrmPerson>(`/limeobject/person/${id}/`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawLimeCrmPerson>(
      '/limeobject/person/',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawLimeCrmPerson>(
      `/limeobject/person/${id}/`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/limeobject/person/${id}/`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listCollection<RawLimeCrmCompany>(
      credentials,
      params,
      '/limeobject/company/',
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawLimeCrmCompany>(`/limeobject/company/${id}/`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawLimeCrmCompany>(
      '/limeobject/company/',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawLimeCrmCompany>(
      `/limeobject/company/${id}/`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/limeobject/company/${id}/`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listCollection<RawLimeCrmDeal>(
      credentials,
      params,
      '/limeobject/deal/',
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawLimeCrmDeal>(`/limeobject/deal/${id}/`)
    return transformDeal(raw)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * Refused. The Limeobject API's collections are company, person, deal, todo,
   * history, document, campaign, participant, office, infotiles,
   * solutionimprovement, localize and coworker: there is no dealstatus
   * collection. dealstatus is an option property of deal ("dealstatus:",
   * "title: \"Status\"", with id/key/text), and the Limetype API's documented
   * limetype schema carries only name, label, localname and sort_order, so no
   * documented response lists the options.
   */
  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw Object.assign(
      new Error(
        'Lime CRM cannot list pipelines: the documented APIs have no dealstatus collection; "dealstatus" is an option property on deal, and the documented limetype schema lists no option values',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
}
