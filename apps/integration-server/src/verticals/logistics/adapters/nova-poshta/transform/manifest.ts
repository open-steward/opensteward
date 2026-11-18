import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate, parseDecimal } from '../../shared/transform'
import { NOVA_POSHTA_CARRIER_ID } from '../constants'

/**
 * Nova Poshta declaration group (manifest) object returned by
 * POST /declaration-groups.
 *
 * Documented at api-portal.novapost.com — manifests section.
 * Fields reflect the confirmed POST /declaration-groups response.
 */
export interface NovaPoshtaDeclarationGroup {
  /** Manifest number (internal Nova Poshta identifier). */
  number?: string | null
  /** Partner-assigned number. */
  partnerNumber?: string | null
  declarationGroupNumber?: string | null
  /** Manifest status string, e.g. "Created", "Submitted", "Accepted". */
  status?: string | null
  statusDateTime?: string | null
  name?: string | null
  type?: string | null
  deliveryPartner?: string | null
  divisionId?: string | null
  countryCode?: string | null
  recipientCompanyTin?: string | null
  recipientCompanyName?: string | null
  recipientCountryCode?: string | null
  senderCompanyTin?: string | null
  senderCompanyName?: string | null
  senderAddress?: string | null
  senderCountryCode?: string | null
  shipmentType?: string | null
  grossWeight?: number | null
  parcelsAmount?: number | null
  actualWeight?: number | null
  shipmentAmount?: number | null
  totalCost?: number | null
  currencyCode?: string | null
  /** Array of shipment documents included in this manifest. */
  documents?: Array<{
    id?: string | null
    mainNumber?: string | null
    declarationNumber?: string | null
    declarationStatus?: string | null
    [key: string]: unknown
  }> | null
  createdAt?: string | null
  updatedAt?: string | null
  deletedAt?: string | null
  [key: string]: unknown
}

function mapManifestStatus(status: string | null | undefined): ManifestStatus {
  if (!status) return 'UNKNOWN'
  switch (status.toLowerCase()) {
    case 'created':
    case 'open':
      return 'OPEN'
    case 'closed':
      return 'CLOSED'
    case 'submitted':
    case 'processing':
      return 'SUBMITTED'
    case 'accepted':
    case 'received':
      return 'ACCEPTED'
    default:
      return 'UNKNOWN'
  }
}

export function transformManifest(raw: NovaPoshtaDeclarationGroup): Manifest {
  const shipmentIds = (raw.documents ?? [])
    .map((d) => d.mainNumber ?? d.id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)

  return {
    id: raw.number ?? raw.declarationGroupNumber ?? undefined,
    carrierId: NOVA_POSHTA_CARRIER_ID,
    warehouseId: raw.divisionId ?? undefined,
    manifestNumber: raw.number ?? raw.partnerNumber ?? undefined,
    status: mapManifestStatus(raw.status),
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    labelCount: parseDecimal(raw.parcelsAmount) ?? undefined,
    submittedAt: toISODate(raw.statusDateTime),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
