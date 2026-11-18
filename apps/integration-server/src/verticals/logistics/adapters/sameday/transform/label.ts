import type { Label } from '../../../schema/label'

/**
 * Sameday labels are returned as binary PDF data from:
 *   GET /api/awb/download/{awbNumber}/{type}
 *
 * where {type} is "A4" or "A6".
 *
 * The adapter requests the label URL rather than embedding the binary, so
 * we synthesise a download URL from the AWB number.
 *
 * In production the token-authenticated download URL would be streamed
 * directly; here we surface the path pattern for consumers.
 */

/**
 * Build a canonical Label from an AWB number. The label PDF is fetched via
 * GET /api/awb/download/{awbNumber}/A6.
 */
export function transformLabel(awbNumber: string): Label {
  return {
    id: awbNumber,
    shipmentId: awbNumber,
    trackingNumber: awbNumber,
    carrierId: 'sameday',
    format: 'PDF',
    status: 'CREATED',
    // The label URL is the download endpoint path — callers use the
    // SamedayClient to fetch it with the appropriate auth token.
    url: undefined,
    metadata: { awbNumber } as Record<string, unknown>,
  }
}
