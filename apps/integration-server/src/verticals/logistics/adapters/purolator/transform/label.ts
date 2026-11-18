import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── Purolator raw types ────────────────────────────────────────────────────

export interface PurolatorDocumentDetail {
  DocumentType?: string | null
  Description?: string | null
  DocumentStatus?: string | null
  URL?: string | null
  [key: string]: unknown
}

export interface PurolatorDocument {
  PIN?: { Value?: string | null } | string | null
  DocumentDetails?: { DocumentDetail?: PurolatorDocumentDetail[] } | null
  CreatedOn?: string | null
  [key: string]: unknown
}

export interface PurolatorGetDocumentsResponse {
  Documents?: { Document?: PurolatorDocument[] } | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapLabelStatus(status: string | null | undefined): LabelStatus {
  switch (status?.toUpperCase()) {
    case 'CREATED':   return 'CREATED'
    case 'USED':
    case 'SCANNED':   return 'USED'
    case 'VOIDED':
    case 'CANCELLED': return 'VOIDED'
    case 'REFUNDED':  return 'REFUNDED'
    default:          return 'UNKNOWN'
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pinValue(pin: PurolatorDocument['PIN']): string | undefined {
  if (!pin) return undefined
  if (typeof pin === 'string') return pin || undefined
  return pin.Value ?? undefined
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: PurolatorDocument): Label {
  const details = raw.DocumentDetails?.DocumentDetail ?? []
  const primary = details[0]

  const labelDetail = details.find(
    (d) => d.DocumentType?.toLowerCase().includes('label'),
  ) ?? primary

  return {
    id: pinValue(raw.PIN),
    shipmentId: pinValue(raw.PIN),
    trackingNumber: pinValue(raw.PIN),
    carrierId: 'purolator',
    format: 'PDF',
    status: mapLabelStatus(labelDetail?.DocumentStatus),
    url: labelDetail?.URL ?? undefined,
    createdAt: toISODate(raw.CreatedOn),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformLabels(raw: PurolatorGetDocumentsResponse): Label[] {
  const docs = raw.Documents?.Document ?? []
  return docs.map(transformLabel)
}
