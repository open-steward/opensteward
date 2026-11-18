import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * Raw CDEK print/label task response as returned by GET /print/orders/{uuid}.
 */
export interface CdekPrintResponse {
  entity?: {
    uuid?: string | null
    orders?: Array<{
      order_uuid?: string | null
      cdek_number?: string | null
      [key: string]: unknown
    }> | null
    create_time?: string | null
    url?: string | null
    [key: string]: unknown
  } | null
  requests?: Array<{
    state?: string | null
    date_time?: string | null
    errors?: Array<{ code: string; message: string }> | null
    [key: string]: unknown
  }> | null
  [key: string]: unknown
}

function mapLabelState(state: string | null | undefined) {
  switch ((state ?? '').toUpperCase()) {
    case 'SUCCESSFUL':
      return 'CREATED' as const
    case 'INVALID':
    case 'EXPIRED':
      return 'VOIDED' as const
    default:
      return 'CREATED' as const
  }
}

export function transformLabel(
  raw: CdekPrintResponse,
  shipmentId?: string,
): Label {
  const entity = raw.entity
  const printUuid = entity?.uuid ?? undefined
  const latestRequest = raw.requests?.[(raw.requests?.length ?? 1) - 1]
  const state = latestRequest?.state ?? undefined
  const createTime = entity?.create_time ?? latestRequest?.date_time ?? undefined
  const labelUrl = entity?.url ?? undefined

  return {
    id: printUuid,
    shipmentId,
    format: 'PDF',
    status: mapLabelState(state),
    url: labelUrl,
    createdAt: toISODate(createTime),
    metadata: raw as Record<string, unknown>,
  }
}
