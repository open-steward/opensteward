/**
 * Amazon SP-API Shipping v2 — getCarrierAccounts response → canonical Carrier.
 *
 * `PUT /shipping/v2/carrierAccounts` (body `{}`) returns `activeAccounts`, an
 * array of objects each carrying an `accountId` and a `carrierId`. There is
 * no separate carrier-name or service-list returned by this endpoint; the
 * carrierId IS the stable identifier (e.g. "FedEx", "UPS").
 *
 * Self-contained copy of `amazon-shipping/transform/carrier.ts`. Adapters in
 * this repo never import across adapter directories — each stands alone so
 * one can change without dragging its neighbour — so the shape is duplicated
 * here rather than shared. Raw types carry this adapter's `SpApi` prefix.
 *
 * Docs: https://github.com/amzn/selling-partner-api-models/blob/main/models/shipping-api-model/shippingV2.json
 *       operationId: getCarrierAccounts
 */
import type { Carrier } from '../../../schema/carrier'

export interface SpApiActiveAccount {
  accountId?: string | null
  carrierId?: string | null
  [key: string]: unknown
}

export interface SpApiGetCarrierAccountsResponse {
  activeAccounts?: SpApiActiveAccount[] | null
  [key: string]: unknown
}

export function transformCarrier(raw: SpApiActiveAccount): Carrier {
  const carrierId = raw.carrierId ?? undefined
  return {
    id: raw.accountId ?? carrierId,
    name: carrierId,
    code: carrierId,
    // The endpoint only ever lists active accounts, so this is what the
    // response asserts rather than a default.
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}

export function extractCarriers(raw: SpApiGetCarrierAccountsResponse): SpApiActiveAccount[] {
  return raw.activeAccounts ?? []
}
