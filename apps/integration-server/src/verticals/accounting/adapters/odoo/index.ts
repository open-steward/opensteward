/**
 * Odoo accounting adapter, on the shared Odoo client (@opensteward/shared
 * adapter/odoo): JSON-2 on Odoo 19+, External RPC (/jsonrpc execute_kw) on
 * 14–18, as the connection chooses.
 *
 * Until this rewrite it POSTed the web client's /web/dataset/call_kw route,
 * which is session-only (`auth="user"`), with an `api-key` header Odoo never
 * reads, so no call could have authenticated.
 *
 * Credentials: the shared Odoo form (baseUrl, apiVersion, database, login,
 * apiKey). Connections made with the earlier form have no `apiVersion` and are
 * refused with a "reconnect" 401 before any request; they must be reconnected.
 *
 * Models (unchanged): res.company (organization), account.move with
 * move_type = 'out_invoice' (invoices), res.partner with is_company (contacts),
 * account.account (accounts).
 */
import {
  ODOO_CREDENTIAL_FORM,
  OdooClient,
  odooDatetime,
  pageOffset,
  reportUpstreamPage,
  type OdooDomain,
} from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type OdooInvoice } from './transform/invoice'
import { transformContact, type OdooPartner } from './transform/contact'
import { transformAccount, type OdooAccount } from './transform/account'
import { transformOrganization, type OdooCompany } from './transform/organization'

const INVOICE_FIELDS = [
  'id',
  'name',
  'partner_id',
  'invoice_date',
  'invoice_date_due',
  'currency_id',
  'amount_total',
  'amount_residual',
  'amount_tax',
  'state',
  'payment_state',
]
const CONTACT_FIELDS = [
  'id',
  'name',
  'email',
  'phone',
  'mobile',
  'vat',
  'customer_rank',
  'supplier_rank',
  'active',
  'currency_id',
]
/**
 * account.account differs by version (addons/account/models/account_account.py):
 * `account_type` from 16.0, `internal_group` in 14.0; `deprecated` up to 18.0,
 * `active` in 19.0. There is no `balance` field in any of them. The client
 * asks only for the ones the server has (OdooClient.fieldsOf).
 */
const ACCOUNT_FIELDS = [
  'id',
  'code',
  'name',
  'account_type',
  'internal_group',
  'deprecated',
  'active',
  'currency_id',
]

const INVOICE_DOMAIN: OdooDomain = [['move_type', '=', 'out_invoice']]
const CONTACT_DOMAIN: OdooDomain = [['is_company', '=', true]]

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Odoo: ${what} ${id} not found`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

/** Odoo record ids are integers; anything else names no record. */
function recordId(what: string, id: string): number {
  if (!/^[1-9]\d*$/.test(id)) throw notFound(what, id)
  return Number(id)
}

export class OdooAdapter implements AccountingAdapter {
  // Connect Link support — the shared Odoo form.
  credentialFields = ODOO_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = ODOO_CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'odoo'
  readonly version = '0.2.0'

  /** Config is unused: the Odoo URL and database are per connection. */
  constructor(_config: Record<string, unknown> = {}) {}

  // ── Auth (API key — no OAuth2) ────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('OdooAdapter: OAuth2 not supported. Connect with the Odoo form.')
  }

  /** An API key is sent as is; it cannot be refreshed, only replaced on reconnect. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private client(credentials: Credentials): OdooClient {
    return new OdooClient(credentials)
  }

  private async pageOf<T>(
    credentials: Credentials,
    params: QueryParams,
    model: string,
    domain: OdooDomain,
    fields: string[],
  ): Promise<T[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    // Odoo reads a missing or zero limit as "maximum number of records to return
    // (default: all)" (ORM reference, search), so a bad one is refused here.
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
      throw Object.assign(new Error(`Odoo: limit must be an integer ≥ 1 (got ${String(limit)})`), {
        statusCode: 400,
        code: 'VALIDATION',
      })
    }
    const offset = pageOffset(params, limit)
    const page = await this.client(credentials).searchPage<T>(model, {
      domain,
      fields,
      offset,
      limit,
    })
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(page.totalCount !== undefined ? { totalCount: page.totalCount } : {}),
    })
    return page.rows
  }

  /**
   * One record by id, or a 404. `read`, not `search_read`: the latter's
   * default active filter 404s every archived contact and account (odoo-crm
   * reads the same way).
   */
  private async one<T>(
    credentials: Credentials,
    what: string,
    model: string,
    id: string,
    fields: string[],
  ): Promise<T> {
    const [row] = await this.client(credentials).read<T>(model, [recordId(what, id)], fields)
    if (!row) throw notFound(what, id)
    return row
  }

  // ── Organization ──────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const [company] = await this.client(credentials).searchRead<OdooCompany>('res.company', {
      domain: [],
      fields: ['name', 'vat', 'website', 'currency_id', 'partner_id'],
      limit: 1,
    })
    if (!company) throw notFound('company', 'of this connection')
    return transformOrganization(company)
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const domain: OdooDomain = [...INVOICE_DOMAIN]
    if (params.updatedAfter) {
      domain.push(['write_date', '>=', odooDatetime(params.updatedAfter)])
    }
    const rows = await this.pageOf<OdooInvoice>(
      credentials,
      params,
      'account.move',
      domain,
      INVOICE_FIELDS,
    )
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    return transformInvoice(
      await this.one<OdooInvoice>(credentials, 'invoice', 'account.move', id, [
        ...INVOICE_FIELDS,
        'invoice_line_ids',
      ]),
    )
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.pageOf<OdooPartner>(
      credentials,
      params,
      'res.partner',
      CONTACT_DOMAIN,
      CONTACT_FIELDS,
    )
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    return transformContact(
      await this.one<OdooPartner>(credentials, 'contact', 'res.partner', id, [
        ...CONTACT_FIELDS,
        'street',
        'city',
        'zip',
        'country_id',
      ]),
    )
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const rows = await this.pageOf<OdooAccount>(
      credentials,
      params,
      'account.account',
      [],
      ACCOUNT_FIELDS,
    )
    return rows.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    return transformAccount(
      await this.one<OdooAccount>(credentials, 'account', 'account.account', id, ACCOUNT_FIELDS),
    )
  }
}
