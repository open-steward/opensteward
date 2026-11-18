/**
 * Amazon Pay adapter — payments vertical.
 *
 * Amazon Pay's API v2 is a by-id REST API: there are NO list endpoints, so the
 * adapter implements only the get/create/capture/cancel verbs the platform
 * actually supports. Everything else on `PaymentsAdapter` is left unimplemented
 * and the router returns 501.
 *
 * Resources implemented:
 *   - Charge          getCharge / captureCharge / cancelCharge
 *   - Charge Permission → getCustomer  (the buyer lives on a charge permission)
 *   - Refund          getRefund / createRefund
 *   - Dispute         getDispute (GET /disputes/:disputeId)
 *
 * Auth: RSA request signing (auth_type `api_key`) — see auth.ts / client.ts.
 * Webhooks: delivered as Amazon SNS notifications verified with an X.509
 *   certificate, which does not fit the HMAC-secret `verifyWebhook` contract,
 *   so no webhook handler is registered here.
 *
 * Docs: https://developer.amazon.com/docs/amazon-pay-api-v2/introduction.html
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Amazon Pay exposes settlement data only
 *   via async Reports API (flat-file download), not a REST balance-transaction
 *   endpoint; no per-transaction ledger resource exists in the v2 API.
 * Unavailable: invoice — Amazon Pay has no invoice object; billing is driven
 *   entirely by Charge Permissions and Charges.
 * Unavailable: payment-method — stored payment methods are managed inside the
 *   Amazon Pay wallet; no REST endpoint exposes a retrievable PaymentMethod
 *   object in API v2.
 * Unavailable: payout — settlement disbursements are reported in flat-file
 *   Settlement Reports (Reports API), not a dedicated payout REST resource.
 * Unavailable: plan — Amazon Pay has no plan/price/product catalog; recurring
 *   billing is modelled as Charge Permissions, not subscription plans.
 * Unavailable: subscription — Amazon Pay models recurring consent as Charge
 *   Permissions, not a distinct subscription object with billing intervals.
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Dispute } from '../../schema/dispute'
import type { Refund } from '../../schema/refund'

import { PATHS } from './constants'
import { CREDENTIAL_FORM } from './auth'
import { AmazonPayClient } from './client'

import { transformCharge, type RawAmazonPayCharge } from './transform/charge'
import {
  transformCustomer,
  type RawAmazonPayChargePermission,
} from './transform/customer'
import {
  transformRefund,
  buildRefundBody,
  type RawAmazonPayRefund,
} from './transform/refund'
import {
  transformDispute,
  type RawAmazonPayDispute,
} from './transform/dispute'

export class AmazonPayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'amazon-pay'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Amazon Pay uses request signing (api_key); submit credentials via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Amazon Pay uses request signing (api_key); call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FORM.credentialFields()
  }

  exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // RSA-signed credentials never expire; nothing to refresh.
    return credentials
  }

  private client(credentials: Credentials): AmazonPayClient {
    return new AmazonPayClient(credentials)
  }

  // ── Charges ────────────────────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawAmazonPayCharge>(`${PATHS.charges}/${id}`)
    return transformCharge(raw)
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const client = this.client(credentials)
    // Amazon Pay's capture body requires a Price (amount + currency). When the
    // caller supplies only a minor-unit amount we look up the charge to learn
    // its currency; otherwise we capture the full authorised amount.
    const existing = await client.get<RawAmazonPayCharge>(`${PATHS.charges}/${id}`)
    const currency = (
      existing.chargeAmount?.currencyCode ??
      existing.captureAmount?.currencyCode ??
      'USD'
    ).toUpperCase()
    const captureAmount =
      data?.amount != null
        ? { amount: minorUnitsToDecimal(data.amount, currency), currencyCode: currency }
        : existing.chargeAmount
    const raw = await client.post<RawAmazonPayCharge>(`${PATHS.charges}/${id}/capture`, {
      captureAmount,
      softDescriptor: existing.softDescriptor,
    })
    return transformCharge(raw)
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).delete<RawAmazonPayCharge>(
      `${PATHS.charges}/${id}/cancel`,
      { cancellationReason: 'Cancelled via OpenSteward' },
    )
    return transformCharge(raw)
  }

  // ── Customers (Charge Permissions) ──────────────────────────────────────────
  //
  // Amazon Pay exposes buyer details only through a Charge Permission, so the
  // canonical `getCustomer(id)` takes a chargePermissionId. There is no list
  // endpoint, so `listCustomers` is intentionally not implemented.

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawAmazonPayChargePermission>(
      `${PATHS.chargePermissions}/${id}`,
    )
    return transformCustomer(raw)
  }

  // ── Refunds ──────────────────────────────────────────────────────────────────

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.client(credentials).get<RawAmazonPayRefund>(`${PATHS.refunds}/${id}`)
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const body = buildRefundBody(data)
    const raw = await this.client(credentials).post<RawAmazonPayRefund>(PATHS.refunds, body)
    return transformRefund(raw)
  }

  // ── Disputes ─────────────────────────────────────────────────────────────────
  //
  // Amazon Pay v2 has a GET /disputes/:disputeId endpoint. There is no list
  // endpoint, so `listDisputes` is intentionally not implemented.

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const raw = await this.client(credentials).get<RawAmazonPayDispute>(
      `${PATHS.disputes}/${id}`,
    )
    return transformDispute(raw)
  }
}

/**
 * Inverse of `toMinorUnits` for capture amounts: render integer minor units as
 * the decimal string Amazon Pay's Price object expects (e.g. 1400 + USD →
 * "14.00").
 */
function minorUnitsToDecimal(amount: number, currency: string): string {
  const code = currency.toUpperCase()
  const exponent = ['JPY', 'KRW', 'ISK', 'CLP', 'VND'].includes(code)
    ? 0
    : ['BHD', 'KWD', 'OMR'].includes(code)
      ? 3
      : 2
  return exponent === 0 ? String(Math.round(amount)) : (amount / Math.pow(10, exponent)).toFixed(exponent)
}
