import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── CTT raw types ─────────────────────────────────────────────────────────

// Response from GET /labels/{runid} once Finished === 100
export interface CttLabelReferenceResult {
  ReferenceCode: string
  ShopItemId?: string | null
  TrackingId?: string | null
  TrackingUrl?: string | null
  Error?: { Id: number; Info: string } | null
  [key: string]: unknown
}

export interface CttLabelResponse {
  Finished?: number | null
  CallbackURL?: string | null
  LabelPDF?: string | null       // base64 PDF blob
  LabelZPL?: string | null       // base64 ZPL blob
  LabelFile?: string | null      // legacy download URL (deprecated)
  ClientReferenceCodeList?: CttLabelReferenceResult[]
  Error?: { Id: number; Info: string } | null
  createdAt?: string | null      // injected by adapter when label run is initiated
  [key: string]: unknown
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapLabelStatus(raw: CttLabelResponse): LabelStatus {
  if (raw.Error && raw.Error.Id !== 0) return 'VOIDED'
  if ((raw.Finished ?? 0) >= 100) return 'CREATED'
  return 'CREATED'
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: CttLabelResponse, referenceCode?: string): Label {
  // Find the matching reference result if a referenceCode is provided
  const refResult = referenceCode
    ? raw.ClientReferenceCodeList?.find((r) => r.ReferenceCode === referenceCode)
    : raw.ClientReferenceCodeList?.[0]

  // Prefer base64 ZPL if present, otherwise PDF
  const base64 = raw.LabelZPL ?? raw.LabelPDF ?? undefined
  const format = raw.LabelZPL ? 'ZPL' as const : raw.LabelPDF ? 'PDF' as const : undefined

  return {
    id: refResult?.ShopItemId ?? refResult?.ReferenceCode ?? undefined,
    carrierId: 'ctt',
    trackingNumber: refResult?.TrackingId ?? undefined,
    format,
    status: mapLabelStatus(raw),
    url: raw.LabelFile ?? undefined,
    base64,
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
