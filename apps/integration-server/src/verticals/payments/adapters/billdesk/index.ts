/**
 * BillDesk adapter — payments vertical (India anchor).
 *
 * BillDesk is order-centric. An **Order** (`/orders/create`) reserves the
 * amount + currency for a checkout; a **Transaction** (`/transactions/get`) is
 * the captured payment attempt, which maps onto the canonical **Charge**; a
 * **Refund** (`/refunds/create`, `/refunds/get`) is taken against a settled
 * transaction. Every endpoint is a POST and there is NO global "list"
 * endpoint and NO standalone customer resource.
 *
 * Implemented methods:
 *   - `createCharge`       → POST /payments/ve1_2/orders/create
 *   - `getCharge(id)`      → POST /payments/ve1_2/transactions/get
 *   - `createRefund`       → POST /payments/ve1_2/refunds/create
 *   - `getRefund(id)`      → POST /payments/ve1_2/refunds/get
 *   - `createSubscription` → POST /pgsi/ve1_2/mandates/create  (mandate = recurring auth)
 *   - `getSubscription(id)`→ POST /pgsi/ve1_2/mandates/get
 *   - `listSubscriptions`  → POST /pgsi/ve1_2/mandates/list
 *   - `createInvoice`      → POST /pgsi/ve1_2/invoices/create  (mandate debit instruction)
 *   - `getInvoice(id)`     → POST /pgsi/ve1_2/invoices/get
 *
 * Auth: a JWS (HMAC-SHA-256) signed body keyed with the merchant `secretkey`,
 * with `clientid` in the JWS header (see auth.ts / client.ts). No OAuth, no
 * token refresh.
 *
 * Money: BillDesk quotes MAJOR units (rupee decimal strings) and ISO 4217
 * NUMERIC currency codes; the transforms scale to minor units and map to the
 * alpha code.
 *
 * Webhooks: JWS-HMAC-SHA-256 signed LCM notifications (see webhook.ts).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — no per-transaction ledger API; settlement batches only
 * Unavailable: customer — BillDesk has no standalone customer management API
 * Unavailable: dispute — no dispute API; handled via merchant dashboard / banking network
 * Unavailable: payment-method — card-account endpoints exist (/pgsi/ve1_2/cardaccounts/*) but response field names are not accessible without merchant login; unverified
 * Unavailable: payout — settlements API exists but uses a different base path and has no per-payout object
 * Unavailable: plan — no plan/product/price catalog API; mandate amounts set at creation time
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { Invoice } from '../../schema/invoice'
import type { WebhookEvent } from '../../schema/webhook'

import {
  ORDERS_CREATE_PATH,
  TRANSACTIONS_GET_PATH,
  REFUNDS_CREATE_PATH,
  REFUNDS_GET_PATH,
  MANDATES_CREATE_PATH,
  MANDATES_GET_PATH,
  MANDATES_LIST_PATH,
  INVOICES_CREATE_PATH,
  INVOICES_GET_PATH,
} from './constants'
import { buildCredentials } from './auth'
import { BilldeskClient } from './client'
import { parseBilldeskWebhookEvents, verifyBilldeskWebhook } from './webhook'

import { transformCharge, type RawBilldeskTransaction } from './transform/charge'
import { transformRefund, type RawBilldeskRefund } from './transform/refund'
import { transformSubscription, type RawBilldeskMandate } from './transform/subscription'
import { transformInvoice, type RawBilldeskInvoice } from './transform/invoice'
import { toMajorUnits } from './transform/shared'

function merchantId(credentials: Credentials): string {
  const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
  return String(extra.merchantId ?? '')
}

export class BilldeskAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'billdesk'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'BillDesk uses a JWS-HMAC key pair; submit the client id + secret key + merchant id via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('BillDesk uses a JWS-HMAC key pair; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox (UAT)' },
          { value: 'production', label: 'Production (live)' },
        ],
      },
      {
        name: 'merchantId',
        label: 'Merchant ID (mercid)',
        type: 'text',
        required: true,
        helpText: 'Your BillDesk merchant id, sent as `mercid` in every request body.',
      },
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        helpText: 'Carried in the JWS protected header. Issued by BillDesk at onboarding.',
      },
      {
        name: 'secretKey',
        label: 'Secret key',
        type: 'password',
        required: true,
        helpText:
          'HMAC signing key for request bodies and webhook signatures. Issued by BillDesk at onboarding.',
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
    return verifyBilldeskWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBilldeskWebhookEvents(payload)
  }

  private client(credentials: Credentials): BilldeskClient {
    return new BilldeskClient(credentials)
  }

  // ── Charges (Orders + Transactions) ─────────────────────────────────────────

  /** Reserve a BillDesk order. The returned order is presented as a pending charge. */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const body: Record<string, unknown> = {
      mercid: merchantId(credentials),
      orderid: data.id ?? `ord_${Date.now()}`,
      amount: toMajorUnits(data.amount),
      // BillDesk wants a numeric ISO 4217 code; default INR (356) for the
      // India-anchored gateway. Callers that supply a numeric code pass through.
      currency: /^\d+$/.test(data.currency ?? '') ? data.currency : '356',
      order_date: data.createdAt ?? new Date().toISOString(),
      itemcode: 'DIRECT',
    }
    if (data.description) body.description = data.description
    const raw = await this.client(credentials).post<RawBilldeskTransaction>(ORDERS_CREATE_PATH, body)
    return transformCharge(raw ?? {})
  }

  /** Look up a transaction by its BillDesk transaction id → canonical charge. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).post<RawBilldeskTransaction>(TRANSACTIONS_GET_PATH, {
      mercid: merchantId(credentials),
      transactionid: id,
      refund_details: 'true',
    })
    return transformCharge(raw ?? {})
  }

  // ── Refunds ──────────────────────────────────────────────────────────────────

  /** Create a refund against a transaction. `data.chargeId` = transactionid. */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (BillDesk transactionid) is required for a refund')
    const amount = toMajorUnits(data.amount)
    const body: Record<string, unknown> = {
      mercid: merchantId(credentials),
      transactionid: data.chargeId,
      orderid: data.metadata?.orderid,
      transaction_date: data.createdAt ?? new Date().toISOString(),
      txn_amount: amount,
      refund_amount: amount,
      currency: /^\d+$/.test(data.currency ?? '') ? data.currency : '356',
      // BillDesk requires a unique merchant refund reference.
      merc_refund_ref_no: data.id ?? data.receiptNumber ?? `re_${Date.now()}`,
    }
    const raw = await this.client(credentials).post<RawBilldeskRefund>(REFUNDS_CREATE_PATH, body)
    return transformRefund({ ...raw, transactionid: raw?.transactionid ?? data.chargeId })
  }

  /** Look up a refund by its BillDesk refund id. */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.client(credentials).post<RawBilldeskRefund>(REFUNDS_GET_PATH, {
      mercid: merchantId(credentials),
      refundid: id,
    })
    return transformRefund(raw ?? {})
  }

  // ── Subscriptions (Mandates) ─────────────────────────────────────────────────
  //
  // BillDesk Mandates are recurring payment authorisations. They live under the
  // /pgsi/ve1_2 path prefix at the same host. Endpoints confirmed via
  // https://docs.billdesk.io/llms.txt and
  // https://docs.billdesk.io/reference/retrievemandate (full URL shown in docs).

  /** Register a new recurring mandate. `data.customerId` = mercid; `data.id` = subscription_refid. */
  async createSubscription(credentials: Credentials, data: Partial<Subscription>): Promise<Subscription> {
    const body: Record<string, unknown> = {
      mercid: merchantId(credentials),
      subscription_refid: data.id ?? `sub_${Date.now()}`,
      mandate_amount: toMajorUnits(data.items?.[0]?.amount),
      currency: /^\d+$/.test(data.currency ?? '') ? data.currency : '356',
      frequency: 'MONTHLY',
    }
    if (data.currentPeriodStart) body.mandate_start_date = data.currentPeriodStart
    if (data.currentPeriodEnd) body.mandate_end_date = data.currentPeriodEnd
    const raw = await this.client(credentials).post<RawBilldeskMandate>(MANDATES_CREATE_PATH, body)
    return transformSubscription(raw ?? {})
  }

  /** Look up a mandate by its BillDesk mandate id. */
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).post<RawBilldeskMandate>(MANDATES_GET_PATH, {
      mercid: merchantId(credentials),
      mandateid: id,
    })
    return transformSubscription(raw ?? {})
  }

  /** List mandates for this merchant. BillDesk paginates with `page_number`. */
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const body: Record<string, unknown> = {
      mercid: merchantId(credentials),
      page_number: params.page ?? 1,
    }
    const raw = await this.client(credentials).post<{ mandates?: RawBilldeskMandate[]; data?: RawBilldeskMandate[] } | null>(
      MANDATES_LIST_PATH,
      body,
    )
    const items: RawBilldeskMandate[] = raw?.mandates ?? raw?.data ?? []
    return items.map(transformSubscription)
  }

  // ── Invoices ─────────────────────────────────────────────────────────────────
  //
  // BillDesk Invoices are debit instructions issued within a mandate. They live
  // under the /pgsi/ve1_2 path prefix. Endpoints confirmed via
  // https://docs.billdesk.io/llms.txt (createinvoice.md, retriveinvoice.md).

  /** Issue a debit instruction against a mandate. `data.subscriptionId` = mandateid. */
  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const body: Record<string, unknown> = {
      mercid: merchantId(credentials),
      invoice_number: data.id ?? `inv_${Date.now()}`,
      invoice_display_number: data.number ?? data.id ?? `inv_${Date.now()}`,
      mandateid: data.subscriptionId,
      amount: toMajorUnits(data.total),
      currency: /^\d+$/.test(data.currency ?? '') ? data.currency : '356',
    }
    if (data.createdAt) body.invoice_date = data.createdAt
    if (data.dueDate) body.duedate = data.dueDate
    const raw = await this.client(credentials).post<RawBilldeskInvoice>(INVOICES_CREATE_PATH, body)
    return transformInvoice({ ...raw, invoice_number: raw?.invoice_number ?? String(body.invoice_number) })
  }

  /** Look up a BillDesk invoice by its merchant invoice number. */
  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).post<RawBilldeskInvoice>(INVOICES_GET_PATH, {
      mercid: merchantId(credentials),
      invoice_number: id,
    })
    return transformInvoice(raw ?? {})
  }
}
