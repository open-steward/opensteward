/**
 * Swish adapter — payments vertical.
 *
 * Auth: this client sends the credential as a Bearer token, but Swish
 * documents mutual-TLS authentication with a .p12 merchant certificate
 * (https://developer.swish.nu/api/payment-request/v2), so reads cannot
 * authenticate until the auth is rebuilt. The base URL is the MSS test
 * simulator; the documented production host is https://cpc.getswish.net.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Swish has no balance ledger or settlement API
 * Unavailable: dispute            — Swish has no dispute/chargeback API
 * Unavailable: invoice            — Swish has no invoicing API
 * Unavailable: payment-method     — Swish has no stored payment-method API
 * Unavailable: plan               — Swish has no plan/price/product API
 * Unavailable: subscription       — Swish recurring-payment consents are not subscription objects
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'

import { buildCredentials } from './auth'
import { SwishClient } from './client'

import { transformPayout, type RawSwishPayout } from './transform/payout'
import { transformRefund, type RawSwishRefund } from './transform/refund'

/**
 * Swish documents no collection GET for any resource: every documented read
 * is a GET by a merchant-generated instructionUUID, and outcomes are pushed
 * to the merchant's callbackUrl. The list methods therefore refuse before
 * sending anything. Evidence (Endpoints tables, rendered 2026-09-27):
 *   https://developer.swish.nu/api/payment-request/v2
 *   https://developer.swish.nu/api/refunds/v2
 *   https://developer.swish.nu/api/payouts/v1
 */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class SwishAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'swish'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Swish uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Swish uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'Merchant TLS Certificate',
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

  private client(credentials: Credentials): SwishClient {
    return new SwishClient(credentials)
  }

  // https://developer.swish.nu/api lists exactly these APIs: Payment request,
  // Refunds, Payouts, QR codes, Merchant Swish Simulator, Recurring payments.
  // None has a customer object.
  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'Swish cannot list customers: the API reference (https://developer.swish.nu/api) lists only ' +
        'Payment request, Refunds, Payouts, QR codes, Merchant Swish Simulator and Recurring payments, ' +
        'and none of them has a customer resource.',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'Swish cannot read customers: the API reference (https://developer.swish.nu/api) documents no ' +
        'customer resource.',
    )
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      'Swish cannot list charges: the Payment request API documents only ' +
        '"PUT /swish-cpcapi/api/v2/paymentrequests/{instructionUUID}", ' +
        '"GET /swish-cpcapi/api/v1/paymentrequests/{instructionUUID}" and ' +
        '"PATCH /swish-cpcapi/api/v1/paymentrequests/{instructionUUID}" ' +
        '(https://developer.swish.nu/api/payment-request/v2); there is no collection GET.',
    )
  }

  // The adapter used to call GET /charges/{id}, which Swish does not document.
  // The documented read is GET /swish-cpcapi/api/v1/paymentrequests/{instructionUUID},
  // but it needs mutual-TLS client-certificate auth that this client does not
  // implement, so the read refuses until the auth is rebuilt.
  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'Swish cannot read charges through this adapter: the only documented read is ' +
        '"GET /swish-cpcapi/api/v1/paymentrequests/{instructionUUID}" ' +
        '(https://developer.swish.nu/api/payment-request/v2), which requires a mutual-TLS merchant ' +
        'certificate that this connection does not carry.',
    )
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'Swish cannot list refunds: the Refunds API documents only ' +
        '"PUT /swish-cpcapi/api/v2/refunds/{instructionUUID}" and a GET of one refund by id ' +
        '("To retrieve the status of a refund, use the v1 API call: GET/api/v1/refunds/{id}.", ' +
        'https://developer.swish.nu/api/refunds/v2); there is no collection GET.',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawSwishRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw notSupported(
      'Swish cannot list payouts: the Payouts API documents only "POST /swish-cpcapi/api/v1/payouts/" ' +
        'and "GET /swish-cpcapi/api/v1/payouts/{instructionUUID}" ' +
        '(https://developer.swish.nu/api/payouts/v1); there is no collection GET.',
    )
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<{ data?: RawSwishPayout }>(`/payouts/${id}`)
    return transformPayout(res.data ?? {})
  }
}
