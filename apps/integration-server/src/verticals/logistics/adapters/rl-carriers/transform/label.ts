import type { Label } from '../../../schema/label'

/**
 * R+L Carriers label response.
 * GET /BillOfLading/PrintShippingLabels
 *   ?ProNumber={proNumber}&Style={1-13}&NumberOfLabels={1-100}
 *
 * Reference: https://technology.rlcarriers.com/api-documentation/bill-of-lading/
 */
export interface RlCarriersLabelResponse {
  /** Base64-encoded PDF containing the shipping labels */
  ShippingLabelsFile?: string
  Code?: number
  Errors?: string[]
  [key: string]: unknown
}

export function transformLabel(
  raw: RlCarriersLabelResponse,
  proNumber: string,
): Label {
  return {
    id: proNumber,
    shipmentId: proNumber,
    trackingNumber: proNumber,
    carrierId: 'rl-carriers',
    serviceCode: 'LTL',
    format: 'PDF',
    status: raw.ShippingLabelsFile ? 'CREATED' : undefined,
    base64: raw.ShippingLabelsFile ?? undefined,
    createdAt: new Date(),
    metadata: raw as Record<string, unknown>,
  }
}
