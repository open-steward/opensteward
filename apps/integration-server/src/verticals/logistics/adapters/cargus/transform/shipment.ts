import type { Shipment } from '../../../schema/shipment'
import { transformAddress, type CargusAwbAddress } from './address'

/**
 * One AWB (`UrgentOnlineEntities-Models-AwbModel`) as the first-party portal
 * documents it for `Awbs_GetByDate` ("Get AWB by date with pagination") and
 * `Awbs_Get` ("Get AWB by orderId or barCode"):
 * https://urgentcargus.developer.azure-api.net/api-details#api=55acb9ae5f80b911a8f59a5f&operation=Awbs_GetByDate
 *
 * Only the fields read below are typed. What the documentation leaves open is
 * not mapped:
 *  - `Status` is documented only as "string", with no list of values, so the
 *    canonical status is UNKNOWN (the raw value stays in `metadata`);
 *  - `TotalWeight` and `ParcelCodes[].Weight` carry no documented unit;
 *  - `ShippingCost.GrandTotal` carries no documented currency;
 *  - the model has no label URL and no creation or delivery timestamp
 *    (`ValidationDate` is the validation date, not a creation date).
 */
export interface CargusAwb {
  BarCode?: string | null
  Sender?: CargusAwbAddress | null
  Recipient?: CargusAwbAddress | null
  ServiceId?: number | null
  Observations?: string | null
  CustomString?: string | null
  Status?: string | null
  [key: string]: unknown
}

export function transformShipment(raw: CargusAwb): Shipment {
  const barCode = raw.BarCode || undefined
  return {
    id: barCode,
    status: 'UNKNOWN',
    trackingNumber: barCode,
    carrierId: 'cargus',
    serviceCode: raw.ServiceId != null ? String(raw.ServiceId) : undefined,
    originAddress: raw.Sender ? transformAddress(raw.Sender) : undefined,
    destinationAddress: raw.Recipient ? transformAddress(raw.Recipient) : undefined,
    reference: raw.CustomString || undefined,
    notes: raw.Observations || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
