import type { Label } from '../../../schema/label'

/**
 * Response shape from POST /bill-of-lading/createBOL.
 * Source: ODFL Bill of Lading API OpenAPI spec
 * (github.com/api-evangelist/old-dominion-freight-line)
 */
export interface OldDominionBOLResponse {
  /** Bill of lading identifier */
  bolNumber?: string
  /** PRO (progressive) shipment reference number used for tracking */
  proNumber?: string
  /** Hosted URL for the generated shipping label (PDF) */
  labelUrl?: string
  /** Hosted URL for the BOL document (PDF) */
  bolDocumentUrl?: string
  [key: string]: unknown
}

export function transformLabel(raw: OldDominionBOLResponse): Label {
  return {
    id: raw.bolNumber ?? undefined,
    trackingNumber: raw.proNumber ?? undefined,
    carrierId: 'old-dominion',
    serviceCode: undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.labelUrl ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
