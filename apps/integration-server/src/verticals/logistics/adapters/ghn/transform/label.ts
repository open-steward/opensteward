import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// GHN Print Order / gen-token response shape
// POST /shiip/public-api/v2/a5/gen-token
// Request: { order_codes: string[] }
// Response: { code, message, data: { token: string } }
// The token is then used with: /a5/public-api/printA5?token=<token>

export interface GhnPrintTokenResponse {
  token?: string | null
  [key: string]: unknown
}

// For a single order_code → label entry
export interface GhnLabelInput {
  orderCode: string
  token: string
  createdAt?: string | null
}

const GHN_PRINT_BASE = 'https://online-gateway.ghn.vn/a5/public-api/printA5'

export function transformLabel(input: GhnLabelInput): Label {
  return {
    shipmentId: input.orderCode,
    trackingNumber: input.orderCode,
    carrierId: 'ghn',
    format: 'PDF',
    status: 'CREATED',
    url: input.token ? `${GHN_PRINT_BASE}?token=${input.token}` : undefined,
    createdAt: toISODate(input.createdAt) ?? new Date(),
    metadata: { order_code: input.orderCode, token: input.token } as Record<string, unknown>,
  }
}
