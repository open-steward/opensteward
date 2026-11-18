/**
 * IXOPAY adapter — payments vertical.
 *
 * IXOPAY is a payment-orchestration gateway that fronts 100+ PSPs behind a
 * single integration. It is transaction-oriented: you submit a debit /
 * preauthorize / capture / void / refund against a connector and address the
 * result later by its gateway reference (`uuid`) or your own
 * `merchantTransactionId`. There are no list endpoints, so the list* resource
 * methods are intentionally left unimplemented (the router auto-returns 501).
 *
 * Auth: HTTP Basic Auth (`Authorization: Basic {base64(username:password)}`)
 * combined with a per-request HMAC-SHA512 signature in the `X-Signature`
 * header. Callbacks are verified with the same HMAC scheme (`webhook.ts`).
 *
 * Docs: https://documentation.ixopay.com/api/transaction/transaction-api
 *       https://gateway.ixopay.com/Schema/V3/OpenApiSpecification.yml
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — no balance/ledger reporting API in IXOPAY v3
 * Unavailable: invoice             — no invoice concept; IXOPAY is a transaction gateway only
 * Unavailable: dispute             — dispute action endpoints exist (accept/upload-evidence/submit-evidence) but no query API; dispute data arrives only via push notifications
 * Unavailable: plan                — no plan/product/price catalog; IXOPAY is not a billing platform
 */

import type { BaseAdapter, CredentialField, Credentials } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { TRANSACTION_TYPES } from './constants'
import { FORM } from './auth'
import { IxopayClient } from './client'
import { parseIxopayWebhookEvents, verifyIxopayWebhook } from './webhook'

import { transformCustomer, type RawIxopayCustomer } from './transform/customer'
import {
  transformCharge,
  untransformCharge,
  type RawIxopayTransaction,
} from './transform/charge'
import { transformRefund, type RawIxopayRefund } from './transform/refund'
import { transformPaymentMethod, type RawIxopayRegister } from './transform/payment-method'
import { transformPayout, type RawIxopayPayout } from './transform/payout'
import { transformSubscription, type RawIxopaySchedule } from './transform/subscription'
import { fromMinorUnits } from './transform/shared'

export class IxopayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'ixopay'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    throw new Error('IXOPAY uses an API key + shared secret; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('IXOPAY uses an API key + shared secret; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static credentials — nothing to refresh.
    return credentials
  }

  // ── Webhooks ────────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyIxopayWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseIxopayWebhookEvents(payload)
  }

  // ── Client ──────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): IxopayClient {
    return new IxopayClient(credentials)
  }

  private transactionPath(credentials: Credentials, type: string): string {
    return `/transaction/${this.client(credentials).connectorApiKey}/${type}`
  }

  // ── Charges ───────────────────────────────────────────────────────────────
  //
  // IXOPAY has no charge list; charges are debit transactions addressed by the
  // gateway reference (`uuid`).

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const client = this.client(credentials)
    const res = await client.get<RawIxopayTransaction>(
      `/status/${client.connectorApiKey}/getByUuid/${id}`,
    )
    return transformCharge(res ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const body: Record<string, unknown> = {
      merchantTransactionId: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      ...untransformCharge(data),
    }
    const res = await this.client(credentials).post<RawIxopayTransaction>(
      this.transactionPath(credentials, TRANSACTION_TYPES.debit),
      body,
    )
    return transformCharge(res ?? {})
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const body: Record<string, unknown> = {
      merchantTransactionId: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      referenceId: id,
    }
    if (data?.amount !== undefined) body.amount = data.amount
    const res = await this.client(credentials).post<RawIxopayTransaction>(
      this.transactionPath(credentials, TRANSACTION_TYPES.capture),
      body,
    )
    return transformCharge(res ?? {})
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawIxopayTransaction>(
      this.transactionPath(credentials, TRANSACTION_TYPES.void),
      {
        merchantTransactionId: `void_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        referenceId: id,
      },
    )
    return transformCharge(res ?? {})
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (original transaction uuid) is required for an IXOPAY refund.')
    const body: Record<string, unknown> = {
      merchantTransactionId: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      referenceId: data.chargeId,
    }
    if (data.amount !== undefined && data.currency) {
      // Canonical amount is minor units; IXOPAY wants a major-unit decimal.
      body.amount = fromMinorUnits(data.amount, data.currency)
      body.currency = data.currency.toUpperCase()
    }
    const res = await this.client(credentials).post<RawIxopayRefund>(
      this.transactionPath(credentials, TRANSACTION_TYPES.refund),
      body,
    )
    return transformRefund(res ?? {})
  }

  // ── Customers ───────────────────────────────────────────────────────────────
  //
  // IXOPAY exposes stored customer profiles (no list endpoint). A profile is
  // fetched by its merchant-chosen identification.

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.client(credentials)
    // Base URL already includes /api/v3; path is relative to that base.
    const res = await client.post<RawIxopayCustomer>(
      `/customerProfiles/${client.connectorApiKey}/getProfile`,
      { customerIdentification: id },
    )
    return transformCustomer(res ?? {})
  }

  // ── Payment methods ──────────────────────────────────────────────────────────
  //
  // IXOPAY stores a payment instrument via POST /transaction/{apiKey}/register.
  // The `uuid` of the resulting transaction serves as the stored-instrument
  // reference (`paymentToken`) for future charges. There is no dedicated list
  // or get endpoint — a stored instrument is surfaced only when the transaction
  // response is received or via the customer profile endpoint.

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // The register uuid is also a transaction uuid, so we retrieve it via the
    // standard status endpoint and interpret the returnData as a stored instrument.
    const client = this.client(credentials)
    const res = await client.get<RawIxopayRegister>(
      `/status/${client.connectorApiKey}/getByUuid/${id}`,
    )
    return transformPaymentMethod(res ?? {})
  }

  // ── Payouts ──────────────────────────────────────────────────────────────────
  //
  // IXOPAY exposes payouts via POST /transaction/{apiKey}/payout. The response
  // is the standard TransactionResponse envelope. There is no list endpoint;
  // a payout is retrieved by its uuid via the status endpoint.

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const client = this.client(credentials)
    const res = await client.get<RawIxopayPayout>(
      `/status/${client.connectorApiKey}/getByUuid/${id}`,
    )
    return transformPayout(res ?? {})
  }

  // ── Subscriptions (Schedules) ────────────────────────────────────────────────
  //
  // IXOPAY recurring billing is called "schedules". A schedule requires an
  // existing registration uuid (`registrationUuid`) and fires charges on the
  // configured period. The ScheduleResponse includes scheduleId, registrationId,
  // oldStatus, newStatus, scheduledAt, and merchantMetaData.

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const client = this.client(credentials)
    const res = await client.get<RawIxopaySchedule>(
      `/schedule/${client.connectorApiKey}/${id}/get`,
    )
    return transformSubscription(res ?? {})
  }

  async createSubscription(
    credentials: Credentials,
    data: Partial<Subscription>,
  ): Promise<Subscription> {
    const body: Record<string, unknown> = {
      registrationUuid: data.defaultPaymentMethodId ?? data.customerId,
    }
    if (data.metadata?.['periodLength']) body.periodLength = Number(data.metadata['periodLength'])
    if (data.metadata?.['periodUnit']) body.periodUnit = data.metadata['periodUnit']
    if (data.metadata?.['startDateTime']) body.startDateTime = data.metadata['startDateTime']
    if (data.metadata?.['merchantMetaData']) body.merchantMetaData = data.metadata['merchantMetaData']
    const client = this.client(credentials)
    const res = await client.post<RawIxopaySchedule>(
      `/schedule/${client.connectorApiKey}/start`,
      body,
    )
    return transformSubscription(res ?? {})
  }

  async cancelSubscription(
    credentials: Credentials,
    id: string,
    _data?: { atPeriodEnd?: boolean },
  ): Promise<Subscription> {
    const client = this.client(credentials)
    const res = await client.post<RawIxopaySchedule>(
      `/schedule/${client.connectorApiKey}/${id}/cancel`,
    )
    return transformSubscription(res ?? {})
  }
}
