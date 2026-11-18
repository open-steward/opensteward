/**
 * MyFatoorah adapter — payments vertical.
 *
 * Auth: API key (Bearer token).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — MyFatoorah has no balance/ledger API; settlements are handled operationally
// Unavailable: dispute — No dispute or chargeback API; chargebacks deducted internally without programmatic access
// Unavailable: payout — No payout/settlement API; payouts occur via bank per merchant agreement
// Unavailable: plan — No plan/product catalog; recurring payments are amount-based only

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Invoice } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { buildCredentials } from './auth'
import { MyfatoorahClient } from './client'
import { verifyMyfatoorahWebhook, parseMyfatoorahWebhookEvents } from './webhook'

import { transformRefund, type RawMyfatoorahRefund } from './transform/refund'
import { transformInvoice, type RawMyfatoorahPaymentStatus } from './transform/invoice'
import { transformPaymentMethod, type RawMyfatoorahCard } from './transform/payment-method'
import { transformSubscription, type RawMyfatoorahRecurringPayment } from './transform/subscription'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class MyfatoorahAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'myfatoorah'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('MyFatoorah uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('MyFatoorah uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Token',
        type: 'password',
        required: true,
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
    return verifyMyfatoorahWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseMyfatoorahWebhookEvents(payload)
  }

  private client(credentials: Credentials): MyfatoorahClient {
    return new MyfatoorahClient(credentials)
  }

  // ── Customers, charges, refunds ───────────────────────────────────────────
  // MyFatoorah documents no list endpoint for any of these, only single-record
  // lookups by an id the caller must already hold (llms.txt,
  // https://docs.myfatoorah.com/llms.txt). The old '/customers', '/charges' and
  // '/refunds' paths exist in neither the V2 nor the V3 reference.
  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'MyFatoorah cannot list customers: the only customer endpoint is GET /v3/customers/{Reference}, which "Retrieves the details of a customer including the cards saved with his reference."',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'MyFatoorah customer lookup is not implemented: GET /customers/{id} is not a documented MyFatoorah path (the documented lookup is GET /v3/customers/{Reference}).',
    )
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      'MyFatoorah cannot list charges: payments are read one at a time, GET /v3/payments/{paymentId} "Get the details of a payment by its paymentId."',
    )
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'MyFatoorah charge lookup is not implemented: GET /charges/{id} is not a documented MyFatoorah path (the documented lookup is GET /v3/payments/{paymentId}).',
    )
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'MyFatoorah cannot list refunds: GET /v3/refunds/{refundId} "Retrieves the details of a previously created refund using the refundId."',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawMyfatoorahRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Invoices ───────────────────────────────────────────────────────────────
  // POST /v2/GetPaymentStatus reads ONE invoice by Key + KeyType
  // (https://docs.myfatoorah.com/reference/get-payment-status); it is not a list.
  async listInvoices(_credentials: Credentials, _params: QueryParams): Promise<Invoice[]> {
    throw notSupported(
      'MyFatoorah cannot list invoices: POST /v2/GetPaymentStatus "Checks the status of an invoice" by a required Key and KeyType (InvoiceId, PaymentId or CustomerReference) and returns one invoice.',
    )
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).post<{ Data?: RawMyfatoorahPaymentStatus }>(
      '/v2/GetPaymentStatus',
      {
        Key: id,
        KeyType: 'InvoiceId',
      },
    )
    return transformInvoice(res.Data ?? {})
  }

  // ── Payment methods ────────────────────────────────────────────────────────
  // Saved cards are documented only per customer (GET /v3/customers/{Reference})
  // and there is no customer list to walk; GetPaymentStatus reads one invoice.
  async listPaymentMethods(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<PaymentMethod[]> {
    throw notSupported(
      'MyFatoorah cannot list payment methods: saved cards are returned only by GET /v3/customers/{Reference}, which "Retrieves the details of a customer including the cards saved with his reference.", and no customer list is documented.',
    )
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).post<{ Data?: RawMyfatoorahPaymentStatus }>(
      '/v2/GetPaymentStatus',
      {
        Key: id,
        KeyType: 'PaymentId',
      },
    )
    const txns = (res.Data ?? {})['InvoiceTransactions'] as RawMyfatoorahCard[] | undefined
    const card = (Array.isArray(txns) ? txns[0] : undefined)?.['Card'] as
      RawMyfatoorahCard | undefined
    return transformPaymentMethod(card ?? {})
  }

  // ── Subscriptions (Recurring Payments) ────────────────────────────────────
  // GetRecurringPayment takes no parameters and "returns a list of all
  // recurring payments" (https://docs.myfatoorah.com/reference/get-recurring-payment),
  // so one response is the whole collection and the caller's page is cut here.
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const res = await this.client(credentials).get<{
      Data?: { RecurringPayment?: RawMyfatoorahRecurringPayment[] }
    }>('/v2/getRecurringPayment')
    return pageLocally((res.Data?.RecurringPayment ?? []).map(transformSubscription), params)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<{
      Data?: { RecurringPayment?: RawMyfatoorahRecurringPayment[] }
    }>('/v2/getRecurringPayment')
    const found = (res.Data?.RecurringPayment ?? []).find((r) => String(r['RecurringId']) === id)
    return transformSubscription(found ?? {})
  }
}
