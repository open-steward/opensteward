import type { Label } from '../../../schema/label'

// ─── Omniva raw types ──────────────────────────────────────────────────────

export interface OmnivaSuccessAddressCard {
  barcode: string
  fileData: string | null
  [key: string]: unknown
}

export interface OmnivaFailedAddressCard {
  barcode: string
  clientItemId: string | null
  messageCode: string | null
  message: string | null
  [key: string]: unknown
}

export interface OmnivaPackageLabelsResponse {
  successAddressCards: OmnivaSuccessAddressCard[]
  failedAddressCards: OmnivaFailedAddressCard[]
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: OmnivaSuccessAddressCard): Label {
  return {
    id: raw.barcode,
    trackingNumber: raw.barcode,
    carrierId: 'omniva',
    format: 'PDF',
    status: 'CREATED',
    base64: raw.fileData ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformLabels(raw: OmnivaPackageLabelsResponse): Label[] {
  return (raw.successAddressCards ?? []).map(transformLabel)
}
