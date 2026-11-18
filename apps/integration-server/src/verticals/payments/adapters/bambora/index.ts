/**
 * Bambora (North America) adapter — payments vertical.
 *
 * Bambora NA — formerly Beanstream, now part of Worldline — is a card-present
 * and card-not-present gateway anchored in Canada + the US. This adapter wraps
 * the classic Bambora NA Payment APIs (`api.na.bambora.com/v1`).
 *
 * Auth: Passcode scheme. The customer supplies their 9-digit merchant ID and an
 * API access passcode; we base64-encode `merchantId:passcode` into the
 * `Authorization: Passcode …` header. There is no OAuth and no separate sandbox
 * host — a test merchant account is what makes a request "test mode".
 *
 * Supported canonical resources:
 *   - Charges        (create / get / list / capture pre-auth / void)
 *   - Refunds        (create via returns / get / list)
 *   - Customers      (get by payment-profile ID)
 *   - PaymentMethods (list / get cards stored on a payment profile)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Bambora exposes only daily aggregate settlement reports
 *   (POST /v1/reports/settlement), not individual per-transaction ledger entries; no
 *   sourceId, fee, or net per transaction.
 * Unavailable: dispute — Chargebacks are managed only via the merchant portal; Bambora
 *   exposes no REST API for listing or responding to disputes programmatically.
 * Unavailable: invoice — Bambora has no invoice concept in its Payment API.
 * Unavailable: payout — Bambora performs automatic bank settlement with no API to initiate
 *   or list individual payouts; the settlement report is aggregate-only.
 * Unavailable: plan — Recurring Billing is a legacy form-POST/querystring API
 *   (scripts/recurring_billing.asp), not REST JSON; no list endpoint exists.
 * Unavailable: subscription — Same legacy form-POST API as plans; GET/list of recurring
 *   accounts is not exposed via a REST endpoint.
 *
 * Bambora has no signed-webhook channel (it posts to merchant callback URLs
 * without an HMAC), so no `verifyWebhook` / `parseWebhookEvents` is exposed —
 * the router auto-501s those.
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { connectionScope, cursorPagerKey, customForm, pageByRows } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Refund } from '../../schema/refund'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { BamboraClient, type ReportSearchBody } from './client'

import { transformCharge, type RawBamboraPayment } from './transform/charge'
import { transformCustomer, type RawBamboraProfile } from './transform/customer'
import { transformPaymentMethod, type RawBamboraCard } from './transform/payment-method'
import { transformRefund, type RawBamboraReturn } from './transform/refund'

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'merchantId',
      label: 'Merchant ID',
      type: 'text',
      required: true,
      placeholder: '300200578',
      helpText: 'Your 9-digit Bambora merchant number.',
    },
    {
      name: 'passcode',
      label: 'API access passcode',
      type: 'password',
      required: true,
      helpText:
        'Portal → Administration → Account Settings → Order Settings → Payment Gateway → Security/Authentication.',
    },
  ],
  exchange: async (fields) => buildCredentials(fields),
})

/**
 * Default reporting window when the caller does not constrain the search:
 * from UTC midnight 90 days before today to the end of the current UTC day.
 *
 * Pinned to whole days rather than to `new Date()`: the search numbers its
 * rows within the window, and a window that slid forward between the request
 * for page 1 and the one for page 2 would renumber them, skipping or
 * repeating rows at the page boundary. Both edges are rounded outward, so the
 * window always contains the sliding `now - 90 days .. now` it replaces, and
 * `end_date` is the coming UTC midnight, up to a day in the future.
 */
function defaultDateWindow(): { start: string; end: string } {
  const DAY = 24 * 60 * 60 * 1000
  const end = new Date((Math.floor(Date.now() / DAY) + 1) * DAY)
  const start = new Date(end.getTime() - 91 * DAY)
  const fmt = (d: Date): string => d.toISOString().slice(0, 19) // Bambora wants no trailing Z
  return { start: fmt(start), end: fmt(end) }
}

/**
 * One caller page of a `POST /reports` search.
 *
 * The search pages by row window: `start_row` is 1-based, "If you are just
 * looking to retrieve one row, set the start row to 1 and the end row to 2",
 * and "If the difference between start and end rows is greater than 500, only
 * the top 500 records will be retrieved." The result is only `{ records }`,
 * with no total and no has-more.
 *
 * Each request asks for the widest window, 500 rows from a start row, and
 * `pageByRows` cuts the caller's rows out of those windows, peeking at the
 * next window when a page ends on a boundary, so `hasMore` is exact. The next
 * window starts after the rows the last one actually returned, which holds
 * whether the upstream reads `end_row` as exclusive (500 rows) or inclusive
 * (501), and a window shorter than 500 rows is the end.
 */
async function searchPage<T>(
  client: BamboraClient,
  credentials: Credentials,
  collection: string,
  params: QueryParams,
  criteria?: ReportSearchBody['criteria'],
): Promise<T[]> {
  const { start, end } = defaultDateWindow()
  const account = String(credentials.extra?.['merchantId'] ?? 'bambora')
  const key = cursorPagerKey(connectionScope(account, credentials), collection, {
    start,
    end,
    criteria: criteria ? JSON.stringify(criteria) : undefined,
    window: MAX_PAGE_SIZE,
  })
  const { items } = await pageByRows<T, number>(
    key,
    params,
    async (cursor) => {
      const startRow = cursor ?? 1
      const body: ReportSearchBody = {
        name: 'Search',
        start_date: start,
        end_date: end,
        start_row: startRow,
        end_row: startRow + MAX_PAGE_SIZE,
        ...(criteria ? { criteria } : {}),
      }
      const records = (await client.searchPayments<T>(body)).records ?? []
      return {
        items: records,
        next: records.length >= MAX_PAGE_SIZE ? startRow + records.length : undefined,
      }
    },
    { defaultLimit: DEFAULT_PAGE_SIZE },
  )
  return items
}

export class BamboraAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'bambora'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'Bambora uses Passcode auth (merchant ID + API access passcode); submit them via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Bambora uses Passcode auth; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Passcode credentials are long-lived; nothing to refresh.
    return credentials
  }

  private client(credentials: Credentials): BamboraClient {
    return new BamboraClient(credentials)
  }

  // ── Charges ────────────────────────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const records = await searchPage<RawBamboraPayment>(
      this.client(credentials),
      credentials,
      'charges',
      params,
    )
    return records.map((r) => transformCharge(r))
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawBamboraPayment>(`/payments/${id}`)
    return transformCharge(res)
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const res = await this.client(credentials).post<RawBamboraPayment>('/payments', {
      amount: (data.amount ?? 0) / 100,
      payment_method: 'payment_profile',
      order_number: data.statementDescriptor,
    })
    return transformCharge(res)
  }

  /** Capture (complete) a previously-authorised pre-auth payment. */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const body = data?.amount != null ? { amount: data.amount / 100 } : {}
    const res = await this.client(credentials).post<RawBamboraPayment>(
      `/payments/${id}/completions`,
      body,
    )
    return transformCharge(res)
  }

  /** Void (reverse) an uncaptured authorisation or same-day settlement. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const original = await this.client(credentials).get<RawBamboraPayment>(`/payments/${id}`)
    const res = await this.client(credentials).post<RawBamboraPayment>(`/payments/${id}/void`, {
      amount: Number(original.amount ?? 0),
    })
    return transformCharge(res)
  }

  // ── Refunds (Bambora "returns") ─────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    // Criteria index 8 is TransType, and 'R' is a return (refund). Index 1 is
    // TransactionId, which a type code can never match.
    const records = await searchPage<RawBamboraReturn>(
      this.client(credentials),
      credentials,
      'refunds',
      params,
      [{ field: 8, operator: '%3D', value: 'R' }],
    )
    return records.map((r) => transformRefund(r))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<RawBamboraReturn>(`/payments/${id}`)
    return transformRefund(res)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId is required for a Bambora return.')
    const res = await this.client(credentials).post<RawBamboraReturn>(
      `/payments/${data.chargeId}/returns`,
      {
        amount: (data.amount ?? 0) / 100,
        order_number: data.metadata?.order_number,
      },
    )
    return transformRefund(res, data.chargeId)
  }

  // ── Customers (Payment Profiles) ───────────────────────────────────────────
  //
  // Bambora does not expose a bulk-list endpoint for payment profiles; profiles
  // are keyed by a merchant-supplied or system-generated `customer_code`. Only
  // `getCustomer` is implemented — `listCustomers` is omitted (no list API).

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawBamboraProfile>(`/profiles/${id}`)
    return transformCustomer(res)
  }

  // ── Payment Methods (Profile Cards) ────────────────────────────────────────
  //
  // Cards stored on a payment profile are listed via `GET /profiles/{id}/cards`
  // and retrieved individually via `GET /profiles/{id}/cards/{card_id}`. The
  // `params.customerId` field carries the profile ID for listPaymentMethods.

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const profileId = String(params.customerId ?? '')
    if (!profileId) throw new Error('customerId (payment profile ID) is required to list cards.')
    const res = await this.client(credentials).get<{ cards?: RawBamboraCard[] }>(
      `/profiles/${profileId}/cards`,
    )
    return (res.cards ?? []).map((c) => transformPaymentMethod(c, profileId))
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // id is expected as "<profileId>/<cardId>" to address a specific card.
    const [profileId, cardId] = id.split('/')
    if (!profileId || !cardId) {
      throw new Error('Bambora payment-method ID must be "<profileId>/<cardId>" (e.g. "abc123/1").')
    }
    const res = await this.client(credentials).get<RawBamboraCard>(
      `/profiles/${profileId}/cards/${cardId}`,
    )
    return transformPaymentMethod(res, profileId)
  }
}
