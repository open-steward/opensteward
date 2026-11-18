/**
 * Gold-Vision adapter for the CRM vertical.
 *
 * Maps the Gold-Vision REST API to canonical CRM resources.
 * Docs: https://help.gold-vision.com/gold-vision-api/
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   OAuth 2.0 client credentials grant.
 *   Token endpoint: https://uk.gold-vision.me/connect/token
 *   Scope: goldvisionapi
 *
 *   credentials.accessToken   = bearer token (fetched via client-credentials)
 *   credentials.expiresAt     = token expiry (1 hour TTL)
 *   credentials.extra.instanceUrl = customer-specific base URL
 *                                   e.g. https://mycompany.goldvisioncrm.com
 *   credentials.extra.clientId     = OAuth client id (stored for token refresh)
 *   credentials.extra.clientSecret = OAuth client secret (stored for refresh)
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (16):
 *   Contacts:    list, get, create, update
 *   Companies:   list, get, create, update   (Gold-Vision "Accounts" entity)
 *   Deals:       list, get, create, update   (Gold-Vision "Opportunities" entity)
 *   Activities:  list, get, create, update
 *   Pipelines:   list, get
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   deleteContact / deleteCompany / deleteDeal / deleteActivity
 *     Gold-Vision does not expose hard-delete via the REST API.
 *   Notes (listNotes, etc.) — notes are surfaced as filtered Activities;
 *     callers can use listActivities with type=note filter instead.
 */

import { oauth2ClientCredentials } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Activity } from '../../schema/activity'
import type { Pipeline } from '../../schema/pipeline'
import type { WebhookEvent } from '../../schema/webhook'

import { GoldVisionClient } from './client'
import { DEFAULT_PAGE_SIZE, GV_TOKEN_URL, GV_SCOPE } from './constants'
import { fetchAccessToken } from './auth'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawGoldVisionContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawGoldVisionAccount,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawGoldVisionOpportunity,
} from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawGoldVisionActivity,
} from './transform/activity'
import {
  transformPipeline,
  type RawGoldVisionPipeline,
} from './transform/pipeline'

// ── credential form (OAuth2 client credentials + instanceUrl) ─────────────

const GV_FORM = oauth2ClientCredentials({
  tokenUrl: GV_TOKEN_URL,
  scopes: [GV_SCOPE],
  additionalFields: [
    {
      name: 'instanceUrl',
      label: 'Gold-Vision instance URL',
      type: 'text',
      placeholder: 'https://mycompany.goldvisioncrm.com',
      helpText: 'The base URL of your Gold-Vision installation (no trailing slash).',
      required: true,
    },
  ],
})

// ── helpers ───────────────────────────────────────────────────────────────

/** Slice a server-returned array for client-side paging. */
function paginate<T>(items: T[], params: QueryParams): T[] {
  const limit = params.limit ?? DEFAULT_PAGE_SIZE
  const page = Math.max(1, Number(params['page'] ?? 1))
  const offset = (page - 1) * limit
  return items.slice(offset, offset + limit)
}

// ── adapter ───────────────────────────────────────────────────────────────

export class GoldVisionAdapter implements CrmAdapter {
  // Connect Link support — OAuth2 client-credentials form.
  credentialFields = GV_FORM.credentialFields
  exchangeCredentials = GV_FORM.exchangeCredentials

  readonly platform = 'gold-vision'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Gold-Vision uses client credentials, not an auth-code redirect.
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Not used for client-credentials flows; the form calls exchangeCredentials.
    throw new Error('Gold-Vision uses OAuth2 client credentials, not auth-code flow.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Re-run the client-credentials grant using the stored client id/secret.
    const extra = credentials.extra as Record<string, unknown> | undefined
    const clientId = String(extra?.['clientId'] ?? '')
    const clientSecret = String(extra?.['clientSecret'] ?? '')
    if (!clientId || !clientSecret) return credentials

    const fresh = await fetchAccessToken(clientId, clientSecret)
    return {
      ...fresh,
      extra: credentials.extra,
    }
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(
    payload: Buffer,
    headers: Record<string, string>,
    secret: string,
  ): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): GoldVisionClient {
    return new GoldVisionClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Contact[]> {
    const all = await this.client(credentials).get<RawGoldVisionContact[]>(
      'contacts',
    )
    return paginate(all ?? [], params).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).getById<RawGoldVisionContact>(
      'contacts',
      id,
    )
    return transformContact(raw)
  }

  async createContact(
    credentials: Credentials,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawGoldVisionContact>(
      'contacts',
      body,
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).patch<RawGoldVisionContact>(
      'contacts',
      id,
      body,
    )
    return transformContact(raw)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Company[]> {
    const all = await this.client(credentials).get<RawGoldVisionAccount[]>(
      'accounts',
    )
    return paginate(all ?? [], params).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).getById<RawGoldVisionAccount>(
      'accounts',
      id,
    )
    return transformCompany(raw)
  }

  async createCompany(
    credentials: Credentials,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawGoldVisionAccount>(
      'accounts',
      body,
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).patch<RawGoldVisionAccount>(
      'accounts',
      id,
      body,
    )
    return transformCompany(raw)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Deal[]> {
    const all = await this.client(credentials).get<RawGoldVisionOpportunity[]>(
      'opportunities',
    )
    return paginate(all ?? [], params).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).getById<RawGoldVisionOpportunity>(
      'opportunities',
      id,
    )
    return transformDeal(raw)
  }

  async createDeal(
    credentials: Credentials,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).post<RawGoldVisionOpportunity>(
      'opportunities',
      body,
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).patch<RawGoldVisionOpportunity>(
      'opportunities',
      id,
      body,
    )
    return transformDeal(raw)
  }

  // ── Activities ─────────────────────────────────────────────────────────────

  async listActivities(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Activity[]> {
    const all = await this.client(credentials).get<RawGoldVisionActivity[]>(
      'activities',
    )
    return paginate(all ?? [], params).map(transformActivity)
  }

  async getActivity(
    credentials: Credentials,
    id: string,
  ): Promise<Activity> {
    const raw = await this.client(credentials).getById<RawGoldVisionActivity>(
      'activities',
      id,
    )
    return transformActivity(raw)
  }

  async createActivity(
    credentials: Credentials,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).post<RawGoldVisionActivity>(
      'activities',
      body,
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).patch<RawGoldVisionActivity>(
      'activities',
      id,
      body,
    )
    return transformActivity(raw)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Pipeline[]> {
    const all = await this.client(credentials).get<RawGoldVisionPipeline[]>(
      'pipelines',
    )
    return paginate(all ?? [], params).map(transformPipeline)
  }

  async getPipeline(
    credentials: Credentials,
    id: string,
  ): Promise<Pipeline> {
    const raw = await this.client(credentials).getById<RawGoldVisionPipeline>(
      'pipelines',
      id,
    )
    return transformPipeline(raw)
  }
}
