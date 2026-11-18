import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── Evri raw types ─────────────────────────────────────────────────────────

export interface EvriLabelResponse {
  barcode: string | null
  labelType: string | null
  carrier: string | null
  clientName: string | null
  weight: number | null
  orderItemReference: string | null
  itemDescription: string | null
  firstName: string | null
  lastName: string | null
  postcode: string | null
  addressLine1: string | null
  addressLine2: string | null
  addressLine3: string | null
  addressLine4: string | null
  deliveryInstructions: string | null
  deliverySafePlace: string | null
  depotName: string | null
  depotCode: string | null
  date: string | null
  vanName: string | null
  vanCode: string | null
  dropName: string | null
  dropCode: string | null
  courierRoundDescription: string | null
  courierRound: string | null
  [key: string]: unknown
}

// ─── Format mapping ──────────────────────────────────────────────────────────

function mapLabelFormat(labelType: string | null): LabelFormat | undefined {
  if (!labelType) return undefined
  const t = labelType.toUpperCase()
  if (t === 'PDF' || t === 'DEFAULT' || t === 'TWO_PER_PAGE') return 'PDF'
  if (t === 'THERMAL' || t === 'ZPL') return 'ZPL'
  if (t === 'PNG') return 'PNG'
  return undefined
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: EvriLabelResponse): Label {
  return {
    id: raw.barcode ?? undefined,
    trackingNumber: raw.barcode ?? undefined,
    carrierId: 'evri',
    format: mapLabelFormat(raw.labelType),
    status: 'CREATED',
    createdAt: toISODate(raw.date),
    metadata: raw as Record<string, unknown>,
  }
}
