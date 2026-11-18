import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ─── SF Express raw types ───────────────────────────────────────────────────

export interface SFContactInfo {
  contactType: number          // 1 = sender, 2 = receiver
  contact?: string
  tel?: string
  mobile?: string
  company?: string
  province?: string
  city?: string
  county?: string
  address?: string
  countryCode?: string
  [key: string]: unknown
}

export interface SFWaybillNoInfo {
  waybillNo?: string
  [key: string]: unknown
}

/** Response from EXP_RECE_CREATE_ORDER / EXP_RECE_SEARCH_ORDER_RESP */
export interface SFOrderResult {
  orderId?: string
  mailNo?: string
  originCode?: string
  destCode?: string
  filterResult?: number
  waybillNoInfoList?: SFWaybillNoInfo[]
  contactInfoList?: SFContactInfo[]
  totalWeight?: number
  parcelQty?: number
  sendStartTm?: string
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(filterResult?: number): ShipmentStatus {
  // filterResult: 2 = deliverable, 3 = not deliverable; absent = pending/created
  switch (filterResult) {
    case 2: return 'LABEL_CREATED'
    case 3: return 'EXCEPTION'
    default: return 'PENDING'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: SFOrderResult): Shipment {
  const sender = raw.contactInfoList?.find((c) => c.contactType === 1)
  const receiver = raw.contactInfoList?.find((c) => c.contactType === 2)

  const trackingNumber = raw.mailNo
    ?? raw.waybillNoInfoList?.[0]?.waybillNo

  return {
    id: raw.orderId,
    status: mapShipmentStatus(raw.filterResult),
    trackingNumber,
    carrierId: 'sf-express',
    originAddress: sender
      ? {
          name: sender.contact,
          company: sender.company,
          city: sender.city,
          state: sender.province,
          country: sender.countryCode as string | undefined,
          phone: sender.mobile ?? sender.tel,
        }
      : undefined,
    destinationAddress: receiver
      ? {
          name: receiver.contact,
          company: receiver.company,
          city: receiver.city,
          state: receiver.province,
          country: receiver.countryCode as string | undefined,
          phone: receiver.mobile ?? receiver.tel,
        }
      : undefined,
    totalWeight: raw.totalWeight !== undefined
      ? { value: raw.totalWeight, unit: 'kg' }
      : undefined,
    createdAt: raw.sendStartTm ? toISODate(raw.sendStartTm) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
