import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

export interface Terminal49ShippingLine {
  id: string
  type: 'shipping_line'
  attributes: {
    scac: string
    name: string
    short_name?: string | null
    alternative_scacs?: string[] | null
    bill_of_lading_tracking_support?: boolean | null
    booking_number_tracking_support?: boolean | null
    container_number_tracking_support?: boolean | null
    created_at?: string | null
    updated_at?: string | null
    [key: string]: unknown
  }
}

export interface Terminal49ShippingLinesResponse {
  data: Terminal49ShippingLine[]
  links?: Record<string, unknown>
}

export function transformCarrier(raw: Terminal49ShippingLine): Carrier {
  const attr = raw.attributes
  return {
    id: raw.id,
    name: attr.name ?? undefined,
    code: attr.scac ?? undefined,
    isActive: true,
    createdAt: toISODate(attr.created_at),
    updatedAt: toISODate(attr.updated_at),
    metadata: {
      short_name: attr.short_name,
      alternative_scacs: attr.alternative_scacs,
      bill_of_lading_tracking_support: attr.bill_of_lading_tracking_support,
      booking_number_tracking_support: attr.booking_number_tracking_support,
      container_number_tracking_support: attr.container_number_tracking_support,
    },
  }
}
