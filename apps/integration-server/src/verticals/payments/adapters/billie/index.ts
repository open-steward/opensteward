/**
 * Billie adapter — payments vertical (B2B "buy now, pay later").
 *
 * Billie factors B2B invoices: a merchant creates an *order* (the financed
 * transaction), ships goods and creates an *invoice* (capture) which Billie
 * pays out, and issues *credit notes* to refund. There is no end-user OAuth
 * and there are no list endpoints — every resource is addressed by UUID.
 *
 * Canonical mapping:
 *   order        → Charge   (GET/POST /orders, POST /orders/{id}/cancel)
 *   invoice      → Invoice  (GET /invoices/{id}, POST /invoices)
 *   credit note  → Refund   (POST /invoices/{captureId}/credit-notes)
 *
 * Auth: OAuth2 client-credentials (client_id + client_secret → 8h JWT).
 * Registered as `api_key`: the merchant pastes a static secret into the
 * Connect Link form and the token exchange runs server-side.
 *
 * Docs: https://docs.billie.io/reference
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Available:   charge (order), invoice (capture), refund (credit note)
 * Unavailable: balance-transaction — no ledger/balance-transaction API; only orders, invoices, and credit notes exist
 * Unavailable: customer — no customer/debtor management API; debtor details are embedded in the order payload only
 * Unavailable: dispute — no dispute or chargeback API; disputes are handled out-of-band
 * Unavailable: payment-method — no payment-method API; selected_payment_method is a read-only field on an order
 * Unavailable: payout — no payout API; payouts are triggered automatically when an invoice is confirmed
 * Unavailable: plan — transaction-level BNPL platform with no subscription or plan concept
 * Unavailable: subscription — transaction-level BNPL platform with no subscription concept
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Invoice } from '../../schema/invoice'
import type { Refund } from '../../schema/refund'

import { BILLIE_CREDENTIAL_FORM, refreshBillieCredentials } from './auth'
import { BillieClient } from './client'

import { transformCharge, type RawBillieOrder } from './transform/charge'
import { transformInvoice, type RawBillieInvoice } from './transform/invoice'
import { transformRefund } from './transform/refund'
import { toMinorUnits } from './transform/shared'

/** Billie returns only `{ uuid }` from create endpoints. */
interface BillieCreatedResource {
  uuid: string
}

/** Billie `TaxedMoney` on the wire — decimal major units (euros). */
function toTaxedMoney(minor: number | undefined): { gross: number; net: number; tax: number } | undefined {
  if (minor === undefined) return undefined
  const gross = minor / 100
  return { gross, net: gross, tax: 0 }
}

export class BillieAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'billie'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'Billie uses client-credentials auth; submit your client ID + secret via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Billie uses client-credentials auth; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return BILLIE_CREDENTIAL_FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return BILLIE_CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshBillieCredentials(credentials)
  }

  private client(credentials: Credentials): BillieClient {
    return new BillieClient(credentials)
  }

  // ── Charges (Billie orders) ────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawBillieOrder>(`/orders/${id}`)
    return transformCharge(raw ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const client = this.client(credentials)
    const created = await client.post<BillieCreatedResource>('/orders', {
      external_code: data.externalId,
      amount: toTaxedMoney(data.amount),
    })
    const raw = await client.get<RawBillieOrder>(`/orders/${created.uuid}`)
    return transformCharge(raw ?? {})
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const client = this.client(credentials)
    await client.post<void>(`/orders/${id}/cancel`)
    const raw = await client.get<RawBillieOrder>(`/orders/${id}`)
    return transformCharge(raw ?? {})
  }

  // ── Invoices (Billie captures) ──────────────────────────────────────────────

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).get<RawBillieInvoice>(`/invoices/${id}`)
    return transformInvoice(raw ?? {})
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = this.client(credentials)
    const orderId = (data.raw as { orderId?: string } | undefined)?.orderId ?? data.subscriptionId
    if (!orderId) throw new Error('orderId required to create a Billie invoice (capture)')
    const created = await client.post<BillieCreatedResource>('/invoices', {
      orders: [orderId],
      external_code: data.number,
      amount: toTaxedMoney(data.total),
    })
    const raw = await client.get<RawBillieInvoice>(`/invoices/${created.uuid}`)
    return transformInvoice(raw ?? {})
  }

  // ── Refunds (Billie credit notes) ──────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (capture id) required for a Billie credit note')
    const amount = toMinorUnits(data.amount) / 100
    const created = await this.client(credentials).post<BillieCreatedResource>(
      `/invoices/${data.chargeId}/credit-notes`,
      {
        external_code: data.externalId ?? data.id,
        amount: toTaxedMoney(data.amount),
      },
    )
    // The credit-note create returns only a uuid; there is no GET endpoint, so
    // synthesise the canonical Refund from the request + returned id.
    return transformRefund({
      uuid: created.uuid,
      external_code: data.externalId ?? data.id ?? null,
      amount: { gross: amount, net: amount, tax: 0 },
      capture_id: data.chargeId,
    })
  }
}
