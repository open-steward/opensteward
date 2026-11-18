import type { Label } from '../../../schema/label'

/**
 * `POST shipping/label.json` (https://docs.ithinklogistics.com/doc-print-shipment/3):
 * "awb_numbers ... AWB Number which you want to print". Response:
 * `{"status": "success", "status_code": 200, "file_name": "http://pre-alpha.ithinklogistics.com/uploads/shipping/b04f3619fc54612329b089c073a7d812.pdf"}`.
 */
export interface IthinkLogisticsLabelRaw {
  status?: string | null
  status_code?: number | null
  file_name?: string | null
  [key: string]: unknown
}

function absoluteUrl(v: string | null | undefined): string | undefined {
  if (!v) return undefined
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:' ? v : undefined
  } catch {
    return undefined
  }
}

export function transformLabel(raw: IthinkLogisticsLabelRaw, awbNumber: string): Label {
  return {
    id: awbNumber,
    trackingNumber: awbNumber,
    carrierId: 'ithink-logistics',
    format: 'PDF',
    status: raw.status?.toLowerCase() === 'success' ? 'CREATED' : 'unknown',
    url: absoluteUrl(raw.file_name),
    metadata: raw as Record<string, unknown>,
  }
}
