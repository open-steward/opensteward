/**
 * PayTR adapter — payments vertical.
 *
 * Auth: API key (Bearer token).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   none for reads. createRefund is unchanged (out of scope) and still
//              targets a fabricated JSON POST /odeme/api/refunds; the documented
//              refund endpoint is a form POST to https://www.paytr.com/odeme/iade.
// Unavailable: customer, charge, refund reads refuse with 501 NOT_SUPPORTED (see each method).
// Unavailable: balance-transaction — PayTR provides only aggregate daily payment-summary reports; no per-transaction ledger endpoint exists.
// Unavailable: dispute — no public API for dispute or chargeback management; handled offline by PayTR support.
// Unavailable: invoice — PayTR is a payment-processing gateway with no invoicing layer.
// Unavailable: payment-method — Card Storage API stores cards but exposes no queryable payment-method list/get endpoint.
// Unavailable: payout — funds are settled to merchant IBAN automatically; no payout API exists.
// Unavailable: plan — no billing-plan objects; recurring payments are merchant-initiated charges against stored cards.
// Unavailable: subscription — no subscription resource; recurring billing is implemented by merchant-initiated charges on stored cards.

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'

import { buildCredentials } from './auth'
import { PaytrClient } from './client'

import { transformRefund, type RawPaytrRefund } from './transform/refund'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class PaytrAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'paytr'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('PayTR uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('PayTR uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'Merchant Salt',
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

  private client(credentials: Credentials): PaytrClient {
    return new PaytrClient(credentials)
  }

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'PayTR cannot list customers: PayTR documents no customer resource; every documented endpoint is a form POST signed with paytr_token, and none returns customers (https://dev.paytr.com/en)',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'PayTR cannot read customers: PayTR documents no customer resource and no customer lookup (https://dev.paytr.com/en)',
    )
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      'PayTR cannot list charges: the only listing, POST /rapor/islem-dokumu, covers "the date duration (3 days maximum)" and its docs name neither the response key holding the rows nor a per-row id (https://dev.paytr.com/en/islem-dokumu)',
    )
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'PayTR cannot read charges: PayTR documents no GET /charges/{id}; the per-order Status Inquiry (POST /odeme/durum-sorgu) needs merchant_id, merchant_key and merchant_salt, which this connection does not collect (https://dev.paytr.com/en/durum-sorgu)',
    )
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'PayTR cannot list refunds: the Refund API (POST /odeme/iade) only creates refunds, and the only listing, POST /rapor/islem-dokumu, covers "the date duration (3 days maximum)" and its docs name neither the response key holding the rows nor a per-row id (https://dev.paytr.com/en/iade-api, https://dev.paytr.com/en/islem-dokumu)',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawPaytrRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }
}
