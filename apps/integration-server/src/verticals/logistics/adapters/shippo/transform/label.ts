import type { Label, LabelFormat, LabelStatus } from '../../../schema/label'
import { toISODate, parseDecimal } from '../../shared/transform'
import type { ShippoRate } from './rate'

export interface ShippoTransaction {
  object_id: string
  object_created: string
  object_updated: string
  object_owner: string
  object_state: string
  status: string
  rate: string | ShippoRate
  tracking_number: string | null
  tracking_status: string | null
  tracking_url_provider: string | null
  label_url: string | null
  commercial_invoice_url: string | null
  label_file_type: string | null
  parcel: string | null
  metadata: string | null
  messages: unknown[] | null
  test: boolean
  [key: string]: unknown
}

function mapLabelFormat(fileType: string | null | undefined): LabelFormat | undefined {
  if (!fileType) return undefined
  const t = fileType.toUpperCase()
  if (t.includes('PDF')) return 'PDF'
  if (t.includes('PNG')) return 'PNG'
  if (t.includes('ZPL')) return 'ZPL'
  return undefined
}

function mapLabelStatus(status: string): LabelStatus {
  switch (status) {
    case 'SUCCESS':          return 'CREATED'
    case 'REFUNDED':         return 'REFUNDED'
    case 'REFUNDPENDING':    return 'CREATED'
    case 'REFUNDREJECTED':   return 'CREATED'
    case 'ERROR':            return 'VOIDED'
    default:                 return 'CREATED'
  }
}

export function transformLabel(raw: ShippoTransaction): Label {
  const rate = typeof raw.rate === 'object' ? raw.rate : undefined

  return {
    id: raw.object_id,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: rate?.provider ?? undefined,
    serviceCode: rate?.servicelevel?.token ?? undefined,
    format: mapLabelFormat(raw.label_file_type),
    status: mapLabelStatus(raw.status),
    url: raw.label_url ?? undefined,
    cost: rate
      ? {
          amount: parseDecimal(rate.amount) ?? 0,
          currency: rate.currency ?? 'USD',
        }
      : undefined,
    createdAt: toISODate(raw.object_created),
    updatedAt: toISODate(raw.object_updated),
    metadata: raw as Record<string, unknown>,
  }
}
