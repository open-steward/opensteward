export type { Credentials, QueryParams } from '@opensteward/shared'
import type { Credentials, QueryParams, BaseAdapter } from '@opensteward/shared'

import type { Customer } from '../schema/customer'
import type { PaymentMethod } from '../schema/payment-method'
import type { Charge } from '../schema/charge'
import type { Refund } from '../schema/refund'
import type { Subscription } from '../schema/subscription'
import type { Invoice, InvoiceLineItem } from '../schema/invoice'
import type { Payout } from '../schema/payout'
import type { Dispute } from '../schema/dispute'
import type { Plan, Price, Product } from '../schema/plan'
import type { BalanceTransaction } from '../schema/balance-transaction'
import type { WebhookEvent } from '../schema/webhook'

/**
 * PaymentsAdapter — extends BaseAdapter with payment-gateway resource methods.
 *
 * Every resource method is optional. Adapters implement whatever the gateway
 * supports; the router returns `501 Not Implemented` for the rest.
 *
 * Reference implementation: `src/adapters/stripe/`.
 */
export interface PaymentsAdapter extends BaseAdapter {
  // Webhooks (refined return type)
  parseWebhookEvents?(payload: Record<string, unknown>): WebhookEvent[]

  // ── Customers ─────────────────────────────────────────────────────────────
  listCustomers?(credentials: Credentials, params: QueryParams): Promise<Customer[]>
  getCustomer?(credentials: Credentials, id: string): Promise<Customer>
  createCustomer?(credentials: Credentials, data: Partial<Customer>): Promise<Customer>
  updateCustomer?(credentials: Credentials, id: string, data: Partial<Customer>): Promise<Customer>
  deleteCustomer?(credentials: Credentials, id: string): Promise<void>

  // ── Payment methods ───────────────────────────────────────────────────────
  listPaymentMethods?(credentials: Credentials, params: QueryParams): Promise<PaymentMethod[]>
  getPaymentMethod?(credentials: Credentials, id: string): Promise<PaymentMethod>
  detachPaymentMethod?(credentials: Credentials, id: string): Promise<void>

  // ── Charges ───────────────────────────────────────────────────────────────
  listCharges?(credentials: Credentials, params: QueryParams): Promise<Charge[]>
  getCharge?(credentials: Credentials, id: string): Promise<Charge>
  createCharge?(credentials: Credentials, data: Partial<Charge>): Promise<Charge>
  captureCharge?(credentials: Credentials, id: string, data?: { amount?: number }): Promise<Charge>
  /** Cancel an uncaptured authorisation. */
  cancelCharge?(credentials: Credentials, id: string): Promise<Charge>

  // ── Refunds ───────────────────────────────────────────────────────────────
  listRefunds?(credentials: Credentials, params: QueryParams): Promise<Refund[]>
  getRefund?(credentials: Credentials, id: string): Promise<Refund>
  createRefund?(credentials: Credentials, data: Partial<Refund>): Promise<Refund>

  // ── Subscriptions ─────────────────────────────────────────────────────────
  listSubscriptions?(credentials: Credentials, params: QueryParams): Promise<Subscription[]>
  getSubscription?(credentials: Credentials, id: string): Promise<Subscription>
  createSubscription?(credentials: Credentials, data: Partial<Subscription>): Promise<Subscription>
  updateSubscription?(
    credentials: Credentials,
    id: string,
    data: Partial<Subscription>,
  ): Promise<Subscription>
  cancelSubscription?(
    credentials: Credentials,
    id: string,
    data?: { atPeriodEnd?: boolean },
  ): Promise<Subscription>

  // ── Invoices + line items ─────────────────────────────────────────────────
  listInvoices?(credentials: Credentials, params: QueryParams): Promise<Invoice[]>
  getInvoice?(credentials: Credentials, id: string): Promise<Invoice>
  createInvoice?(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice>
  updateInvoice?(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice>
  voidInvoice?(credentials: Credentials, id: string): Promise<Invoice>
  payInvoice?(credentials: Credentials, id: string): Promise<Invoice>
  listInvoiceLineItems?(
    credentials: Credentials,
    invoiceId: string,
    params: QueryParams,
  ): Promise<InvoiceLineItem[]>

  // ── Payouts ───────────────────────────────────────────────────────────────
  listPayouts?(credentials: Credentials, params: QueryParams): Promise<Payout[]>
  getPayout?(credentials: Credentials, id: string): Promise<Payout>

  // ── Disputes ──────────────────────────────────────────────────────────────
  listDisputes?(credentials: Credentials, params: QueryParams): Promise<Dispute[]>
  getDispute?(credentials: Credentials, id: string): Promise<Dispute>
  submitDisputeEvidence?(
    credentials: Credentials,
    id: string,
    data: Record<string, unknown>,
  ): Promise<Dispute>

  // ── Plans / Prices / Products (optional catalog) ─────────────────────────
  listPlans?(credentials: Credentials, params: QueryParams): Promise<Plan[]>
  getPlan?(credentials: Credentials, id: string): Promise<Plan>
  listPrices?(credentials: Credentials, params: QueryParams): Promise<Price[]>
  getPrice?(credentials: Credentials, id: string): Promise<Price>
  listProducts?(credentials: Credentials, params: QueryParams): Promise<Product[]>
  getProduct?(credentials: Credentials, id: string): Promise<Product>

  // ── Balance transactions (optional) ──────────────────────────────────────
  listBalanceTransactions?(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]>
  getBalanceTransaction?(credentials: Credentials, id: string): Promise<BalanceTransaction>
}
