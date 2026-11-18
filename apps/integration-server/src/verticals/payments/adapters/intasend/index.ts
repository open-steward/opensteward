/**
 * IntaSend adapter — payments vertical (East Africa anchor, Kenya-first).
 *
 * IntaSend is invoice-centric: a collection request (M-Pesa STK push, card,
 * bank) creates an **invoice** that carries the amount, currency, payer and
 * payment `state` — so an invoice maps onto the canonical **Charge**:
 *   - `createCharge`  → POST /api/v1/payment/collection/  (M-Pesa STK push)
 *   - `getCharge`     → POST /api/v1/payment/status/       (poll an invoice)
 * The invoice list itself (GET /api/v1/invoices/) serves the canonical Invoice.
 *
 * Refunds are modelled as **chargebacks** (`/api/v1/chargebacks/`) — list,
 * retrieve, create — mapped onto the canonical Refund.
 *
 * Auth: a secret API token (`ISSecretKey_…`) sent as a Bearer token, plus the
 * public key (`ISPubKey_…`) supplied in collection/status request bodies as a
 * business identifier. The key pair is environment-bound; a `sandbox` form
 * flag selects the host. No OAuth, no refresh.
 *
 * Webhooks: IntaSend has no cryptographic signature — deliveries echo a
 * dashboard-configured `challenge` string that the merchant compares (see
 * webhook.ts).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: payment-method — IntaSend has no dedicated payment-method
 *   list/retrieve endpoint; the field appears only as a string on subscription
 *   objects ("CARD-PAYMENT") with no tokenised id or detail object.
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Customer } from '../../schema/customer'
import type { Invoice } from '../../schema/invoice'
import type { Payout } from '../../schema/payout'
import type { Dispute } from '../../schema/dispute'
import type { Plan } from '../../schema/plan'
import type { Subscription } from '../../schema/subscription'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { WebhookEvent } from '../../schema/webhook'

import {
  DEFAULT_PAGE_SIZE,
  COLLECTION_PATH,
  PAYMENT_STATUS_PATH,
  CHARGEBACKS_PATH,
  INVOICES_PATH,
  TRANSACTIONS_PATH,
  SEND_MONEY_TRANSACTIONS_PATH,
  SUBSCRIPTION_PLANS_PATH,
  SUBSCRIPTION_CUSTOMERS_PATH,
  SUBSCRIPTIONS_PATH,
  baseUrl,
} from './constants'
import { buildCredentials, isSandbox, publishableKey } from './auth'
import { IntasendClient } from './client'
import { parseIntasendWebhookEvents, verifyIntasendWebhook } from './webhook'

import {
  transformCharge,
  type RawIntasendInvoice,
  type RawIntasendPaymentStatus,
} from './transform/charge'
import { transformRefund, type RawIntasendChargeback } from './transform/refund'
import { transformCustomer, type RawIntasendSubscriptionCustomer } from './transform/customer'
import { transformInvoice, type RawIntasendInvoiceRecord } from './transform/invoice'
import { transformPayout, type RawIntasendSendMoneyTransaction } from './transform/payout'
import { transformDispute } from './transform/dispute'
import { transformPlan, type RawIntasendPlan } from './transform/plan'
import { transformSubscription, type RawIntasendSubscription } from './transform/subscription'
import {
  transformBalanceTransaction,
  type RawIntasendTransaction,
} from './transform/balance-transaction'

/** A DRF page: `{ count, next, previous, results }`. `next` is null on the last page. */
interface IntasendPage<T> {
  count: number
  next?: string | null
  previous?: string | null
  results: T[]
}

/**
 * The caller's page of one IntaSend list endpoint.
 *
 * Every list operation in IntaSend's OpenAPI spec takes one paging parameter,
 * `page` ("A page number within the paginated result set."), and returns
 * `{ count, next, previous, results }` with `next` null on the last page.
 * No page-size parameter is documented, so the server's page size is fixed
 * and one upstream page is not one caller page: walk upstream pages by
 * `page` and cut the caller's rows out of them with pageByRows, which
 * reports `hasMore` exactly.
 */
async function pageList<T>(
  client: IntasendClient,
  credentials: Credentials,
  path: string,
  params: QueryParams,
): Promise<T[]> {
  const key = cursorPagerKey(
    connectionScope(baseUrl(isSandbox(credentials)), credentials),
    path,
    {},
  )
  const { items } = await pageByRows<T, number>(
    key,
    params,
    async (cursor) => {
      const page = cursor ?? 1
      const res = await client.get<IntasendPage<T>>(path, { page })
      if (!Array.isArray(res?.results)) {
        throw new Error(`IntaSend ${path} returned no \`results\` array`)
      }
      return { items: res.results, next: res.next ? page + 1 : undefined }
    },
    { defaultLimit: DEFAULT_PAGE_SIZE },
  )
  return items
}

export class IntasendAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'intasend'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('IntaSend uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('IntaSend uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'secretKey',
        label: 'Secret API key',
        type: 'password',
        required: true,
        placeholder: 'ISSecretKey_live_xxxxxxxx',
        helpText:
          'Your IntaSend secret key (Settings → API Keys). Used as the Bearer token; never expose it client-side.',
      },
      {
        name: 'publishableKey',
        label: 'Publishable key',
        type: 'text',
        required: false,
        placeholder: 'ISPubKey_live_xxxxxxxx',
        helpText:
          'Your IntaSend public key. Sent in collection/status request bodies to identify your business.',
      },
      {
        name: 'sandbox',
        label: 'Environment',
        type: 'select',
        required: false,
        helpText: 'Use the sandbox host for test keys; live keys must use production.',
        options: [
          { value: 'false', label: 'Production (payment.intasend.com)' },
          { value: 'true', label: 'Sandbox (sandbox.intasend.com)' },
        ],
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyIntasendWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseIntasendWebhookEvents(payload)
  }

  private client(credentials: Credentials): IntasendClient {
    return new IntasendClient(credentials)
  }

  // ── Charges (IntaSend invoices) ──────────────────────────────────────────────
  /** Poll an invoice's status by id (POST /api/v1/payment/status/). */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawIntasendPaymentStatus>(PAYMENT_STATUS_PATH, {
      public_key: publishableKey(credentials),
      invoice_id: id,
    })
    return transformCharge(res ?? {})
  }

  /**
   * Trigger an M-Pesa STK-push collection, creating a new invoice. The payer
   * phone number is required and is read from `metadata.phoneNumber` (the
   * canonical Charge has no phone field).
   */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const phoneNumber = data.metadata?.['phoneNumber'] ?? data.metadata?.['phone_number']
    if (!phoneNumber) {
      throw new Error(
        'metadata.phoneNumber (M-Pesa MSISDN, e.g. 2547…) is required for an IntaSend collection',
      )
    }
    const res = await this.client(credentials).post<
      { invoice?: RawIntasendInvoice } & RawIntasendPaymentStatus
    >(COLLECTION_PATH, {
      public_key: publishableKey(credentials),
      method: 'M-PESA',
      currency: data.currency ?? 'KES',
      // IntaSend bills in major units; the canonical amount is minor units.
      amount: (data.amount ?? 0) / 100,
      phone_number: phoneNumber,
      email: data.receiptEmail ?? undefined,
      api_ref: data.description ?? undefined,
    })
    return transformCharge(res ?? {})
  }

  // ── Refunds (IntaSend chargebacks) ───────────────────────────────────────────
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await pageList<RawIntasendChargeback>(
      this.client(credentials),
      credentials,
      CHARGEBACKS_PATH,
      params,
    )
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<RawIntasendChargeback>(
      `${CHARGEBACKS_PATH}${id}/`,
    )
    return transformRefund(res ?? {})
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (IntaSend invoice id) is required for a refund')
    const res = await this.client(credentials).post<RawIntasendChargeback>(CHARGEBACKS_PATH, {
      invoice: data.chargeId,
      // IntaSend expects the refund amount in major units.
      amount: (data.amount ?? 0) / 100,
      reason: data.reason ?? 'other',
      reason_details: data.metadata?.['reason_details'] ?? undefined,
    })
    return transformRefund(res ?? {})
  }

  // ── Customers (IntaSend subscription customers) ──────────────────────────────
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await pageList<RawIntasendSubscriptionCustomer>(
      this.client(credentials),
      credentials,
      SUBSCRIPTION_CUSTOMERS_PATH,
      params,
    )
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawIntasendSubscriptionCustomer>(
      `${SUBSCRIPTION_CUSTOMERS_PATH}${encodeURIComponent(id)}/`,
    )
    return transformCustomer(res)
  }

  // ── Invoices (`/api/v1/invoices/`) ───────────────────────────────────────────
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await pageList<RawIntasendInvoiceRecord>(
      this.client(credentials),
      credentials,
      INVOICES_PATH,
      params,
    )
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<RawIntasendInvoiceRecord>(
      `${INVOICES_PATH}${id}/`,
    )
    return transformInvoice(res ?? {})
  }

  // ── Payouts (IntaSend send-money transactions) ────────────────────────────────
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await pageList<RawIntasendSendMoneyTransaction>(
      this.client(credentials),
      credentials,
      SEND_MONEY_TRANSACTIONS_PATH,
      params,
    )
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawIntasendSendMoneyTransaction>(
      `${SEND_MONEY_TRANSACTIONS_PATH}${id}/`,
    )
    return transformPayout(res ?? {})
  }

  // ── Disputes (derived from IntaSend chargebacks) ──────────────────────────────
  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const rows = await pageList<RawIntasendChargeback>(
      this.client(credentials),
      credentials,
      CHARGEBACKS_PATH,
      params,
    )
    return rows.map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const res = await this.client(credentials).get<RawIntasendChargeback>(
      `${CHARGEBACKS_PATH}${id}/`,
    )
    return transformDispute(res ?? {})
  }

  // ── Plans (IntaSend subscription plans) ──────────────────────────────────────
  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await pageList<RawIntasendPlan>(
      this.client(credentials),
      credentials,
      SUBSCRIPTION_PLANS_PATH,
      params,
    )
    return rows.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<RawIntasendPlan>(
      `${SUBSCRIPTION_PLANS_PATH}${encodeURIComponent(id)}/`,
    )
    return transformPlan(res)
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────────
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await pageList<RawIntasendSubscription>(
      this.client(credentials),
      credentials,
      SUBSCRIPTIONS_PATH,
      params,
    )
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawIntasendSubscription>(
      `${SUBSCRIPTIONS_PATH}${id}/`,
    )
    return transformSubscription(res ?? {})
  }

  // ── Balance transactions (IntaSend wallet transactions) ───────────────────────
  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const rows = await pageList<RawIntasendTransaction>(
      this.client(credentials),
      credentials,
      TRANSACTIONS_PATH,
      params,
    )
    return rows.map(transformBalanceTransaction)
  }

  async getBalanceTransaction(credentials: Credentials, id: string): Promise<BalanceTransaction> {
    const res = await this.client(credentials).get<RawIntasendTransaction>(
      `${TRANSACTIONS_PATH}${id}/`,
    )
    return transformBalanceTransaction(res ?? {})
  }
}
