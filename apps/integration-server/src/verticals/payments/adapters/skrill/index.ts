/**
 * Skrill adapter — payments vertical.
 *
 * Auth: API key (Bearer token).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: customer, charge (read), refund (read) — the gateway.skrill.com/api REST paths do not exist; see the refusals below
// Unverified:  balance-transaction — gateway.skrill.com/api REST base not confirmed in public docs; real Skrill MQI uses form-POST at skrill.com/app/query.pl
// Unverified:  payout — Skrill Send Money API exists but uses a different base URL (skrill.com/app/api.pl) and XML responses; no JSON /payouts endpoint confirmed
// Unavailable: dispute — no dispute/chargeback API endpoint in Skrill MQI or PSD2 API reference
// Unavailable: invoice — Skrill is a wallet/payment gateway, not an invoicing platform; no invoice concept in API
// Unavailable: payment-method — no merchant API for listing stored payment methods
// Unavailable: plan — no plan/product/pricing concept in Skrill API
// Unavailable: subscription — recurring payment MQI actions (status_rec, cancel_rec) return only status codes and dates, not a rich subscription object

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'

import { buildCredentials } from './auth'
import { SkrillClient } from './client'

import { transformRefund, type RawSkrillRefund } from './transform/refund'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class SkrillAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'skrill'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Skrill uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Skrill uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API/MQI Password',
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

  private client(credentials: Credentials): SkrillClient {
    return new SkrillClient(credentials)
  }

  // Skrill documents only https://www.skrill.com/app/pay.pl, refund.pl and
  // query.pl (Automated Payments and Merchant Query Interfaces Guide 3.3).
  // The gateway.skrill.com/api REST paths these methods used to call do not
  // exist, so each read refuses before sending anything.
  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'Skrill cannot list customers: the MQI supports only the actions repost, status_trn, history, cancel_rec, status_rec, extend_rec, cancel_od, status_od and balance, none of which returns customers',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'Skrill cannot read a customer: no API or MQI action returns a customer object',
    )
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    // MQI action=history returns "the complete account history for the
    // specified period in CSV" but the guide documents only the extended
    // columns (currency, region, account_id), not the base columns, so there
    // is no documented field to map. Rebuild once the CSV layout is documented.
    throw notSupported(
      'Skrill cannot list charges: the only listing, MQI action=history, returns CSV whose columns are not documented beyond the extended "currency, region, and account_id"',
    )
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    // The documented equivalent is MQI action=status_trn, sent as email +
    // MD5-hashed MQI password form parameters; this connection has no email.
    throw notSupported(
      'Skrill cannot read a charge with this connection: MQI action=status_trn requires the merchant account email, which this connection does not hold',
    )
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'Skrill cannot list refunds: refund.pl documents only action=prepare and action=refund, and no MQI action lists refunds',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawSkrillRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }
}
