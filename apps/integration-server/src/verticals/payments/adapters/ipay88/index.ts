/**
 * iPay88 adapter — payments vertical.
 *
 * Auth: API key (Bearer token). NOTE: iPay88's first-party WSDLs authenticate
 * with MerchantCode plus a Signature, not a Bearer key; only createRefund
 * still uses this client (out of scope for the read rebuild).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   none readable. charge, customer and refund reads refuse with 501
//              (see the WSDL notes above listCustomers); createRefund is unchanged.
// Unavailable: balance-transaction — iPay88 exposes no balance/ledger API; only payment initiation and status requery endpoints exist.
// Unavailable: dispute — no dispute or chargeback management API; chargebacks handled offline through the bank/acquirer.
// Unavailable: invoice — no invoice resource or endpoint; iPay88 is a pure payment gateway with no billing/invoicing layer.
// Unavailable: payment-method — no payment-method management API; card/wallet details handled transiently on the hosted payment page.
// Unavailable: payout — settlements processed offline on a weekly schedule; no payout API endpoint exists.
// Unavailable: plan — no subscription plan or pricing API; recurring billing is per-transaction via the Checkout endpoint.
// Unavailable: subscription — recurring payments initiated per-transaction, not managed as subscription objects through a subscription API.

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'

import { buildCredentials } from './auth'
import { Ipay88Client } from './client'

import { transformRefund, type RawIpay88Refund } from './transform/refund'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class Ipay88Adapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'ipay88'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('iPay88 uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('iPay88 uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
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

  private client(credentials: Credentials): Ipay88Client {
    return new Ipay88Client(credentials)
  }

  // Every read below refuses before sending anything. iPay88's first-party
  // API surface is SOAP/ASP only, and none of it lists these resources or
  // reads one by id alone:
  //   https://payment.ipay88.com.my/ePayment/WebService/MHGatewayService/GatewayService.svc?singleWsdl
  //     declares only <wsdl:operation name="EntryPageFunctionality"> and
  //     <wsdl:operation name="EntryPageFunctionalityV2"> (payment initiation).
  //   https://payment.ipay88.com.my/ePayment/Webservice/TxInquiryCardDetails/TxDetailsInquiry.asmx?WSDL
  //     declares only <wsdl:operation name="TxDetailsInquiryCardInfo">, a
  //     single-transaction lookup keyed by MerchantCode, ReferenceNo and Amount
  //     (<s:element minOccurs="0" maxOccurs="1" name="ReferenceNo" type="s:string" />),
  //     whose refunds arrive only nested in that one transaction
  //     (<s:element minOccurs="0" maxOccurs="1" name="Refund" type="tns:ArrayOfRefundTransaction" />).
  // The REST paths this adapter used to call (/customers, /charges, /refunds
  // under /ePayment) return the same HTML error page as a nonsense path.

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'iPay88 cannot list customers: its gateway service WSDL declares only the payment-entry ' +
        'operations "EntryPageFunctionality" and "EntryPageFunctionalityV2"; there is no customer object.',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'iPay88 cannot read a customer: its gateway service WSDL declares only the payment-entry ' +
        'operations "EntryPageFunctionality" and "EntryPageFunctionalityV2"; there is no customer object.',
    )
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      'iPay88 cannot list charges: its only transaction-read operation is "TxDetailsInquiryCardInfo", ' +
        'a single-transaction lookup by MerchantCode, ReferenceNo and Amount.',
    )
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'iPay88 cannot read a charge by id alone: "TxDetailsInquiryCardInfo" needs the MerchantCode, ' +
        'ReferenceNo and Amount of the transaction.',
    )
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'iPay88 cannot list refunds: refunds appear only as the nested "Refund" array ' +
        '(ArrayOfRefundTransaction) inside a single "TxDetailsInquiryCardInfo" transaction lookup.',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawIpay88Refund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }
}
