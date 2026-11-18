import type { Carrier } from '../../../schema/carrier'

// GHN Get Available Services response shape
// POST /shiip/public-api/v2/shipping-order/available-services
// Request: { shop_id, from_district, to_district }
// Response: { code, message, data: GhnServiceRaw[] }
export interface GhnServiceRaw {
  service_id?: number | null
  short_name?: string | null
  service_type_id?: number | null
  [key: string]: unknown
}

export function transformCarrier(services: GhnServiceRaw[]): Carrier {
  return {
    id: 'ghn',
    name: 'GHN Express',
    code: 'ghn',
    trackingUrlTemplate: 'https://ghn.vn/pages/post-tracking?trackingCode={trackingNumber}',
    isActive: true,
    services: services
      .filter((s) => s.service_id != null)
      .map((s) => ({
        code: String(s.service_id),
        name: s.short_name ?? undefined,
      })),
    metadata: { raw_services: services } as Record<string, unknown>,
  }
}
