/**
 * Amazon Shipping v2 — getCarrierAccounts response → canonical Carrier.
 *
 * `PUT /shipping/v2/carrierAccounts` returns `activeAccounts`, an array of
 * objects each carrying an `accountId` and a `carrierId`. There is no
 * separate carrier-name or service-list returned by this endpoint; the
 * carrierId IS the stable identifier (e.g. "ups", "fedex", "dhl").
 *
 * Docs: https://github.com/amzn/selling-partner-api-models/blob/main/models/shipping-api-model/shippingV2.json
 *       operationId: getCarrierAccounts
 */
import type { Carrier } from '../../../schema/carrier'

export interface AmazonActiveAccount {
  accountId?: string | null
  carrierId?: string | null
  [key: string]: unknown
}

export interface AmazonGetCarrierAccountsResponse {
  activeAccounts?: AmazonActiveAccount[] | null
  [key: string]: unknown
}

export function transformCarrier(raw: AmazonActiveAccount): Carrier {
  const carrierId = raw.carrierId ?? undefined
  return {
    id: raw.accountId ?? carrierId,
    name: carrierId,
    code: carrierId,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}

export function extractCarriers(raw: AmazonGetCarrierAccountsResponse): AmazonActiveAccount[] {
  return raw.activeAccounts ?? []
}
