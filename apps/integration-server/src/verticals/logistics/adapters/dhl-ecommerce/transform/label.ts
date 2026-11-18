import type { Label, LabelFormat, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── DHL eCommerce raw types ────────────────────────────────────────────────
// Source: POST /shipping/v4/label  (DHL eCommerce Americas API v4)
//         GET  /shipping/v4/label/{pickup}
//         DELETE /shipping/v4/label/{pickup}  → void

export interface DhlEcommerceLabel {
  /** Customer-supplied package identifier */
  packageId: string | null
  /** DHL-generated package identifier */
  dhlPackageId: string | null
  /** Last-mile carrier tracking identifier */
  trackingId: string | null
  /** Parent shipment identifier */
  shipmentId?: string | null
  /** Ordered product / service code */
  orderedProductId?: string | null
  /**
   * Output format: "ZPL", "PNG", or "PDF"
   * ZPL is returned as PLAIN text; PNG/PDF as BASE64.
   */
  format?: string | null
  /** Label data — BASE64 for PNG/PDF, plain ZPL text for ZPL */
  labelData?: string | null
  /** Label routing/pickup number */
  pickup?: string | null
  /** Label creation timestamp */
  createdAt?: string | null
  [key: string]: unknown
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapLabelFormat(format: string | null | undefined): LabelFormat | undefined {
  switch ((format ?? '').toUpperCase()) {
    case 'PDF':  return 'PDF'
    case 'PNG':  return 'PNG'
    case 'ZPL':  return 'ZPL'
    default:     return undefined
  }
}

function mapLabelStatus(raw: DhlEcommerceLabel): LabelStatus {
  // DHL eCommerce does not expose a label status field; infer from presence
  if (!raw.dhlPackageId && !raw.labelData) return 'UNKNOWN' as LabelStatus
  return 'CREATED'
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: DhlEcommerceLabel): Label {
  const fmt = mapLabelFormat(raw.format)

  return {
    id: raw.dhlPackageId ?? raw.packageId ?? undefined,
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: raw.trackingId ?? undefined,
    carrierId: 'dhl-ecommerce',
    serviceCode: raw.orderedProductId ?? undefined,
    format: fmt,
    status: mapLabelStatus(raw),
    // For ZPL labels the API returns plain text (not base64)
    base64: raw.labelData ?? undefined,
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
