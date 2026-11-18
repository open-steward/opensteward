import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions, parseDecimal, toAddress } from '../../shared/transform'

/**
 * Raw Loggi package / shipment object returned by:
 *   GET /v1/companies/{company_id}/packages/{tracking_code}
 *   POST /v1/companies/{company_id}/async-shipments  (async creation response)
 */
export interface LoggiPackage {
  loggiKey?: string | null
  trackingCode?: string | null
  status?: string | null
  statusCode?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  estimatedDeliveryDate?: string | null
  deliveredAt?: string | null
  /** Sender/origin address */
  sender?: Record<string, unknown> | null
  /** Recipient/destination address */
  recipient?: Record<string, unknown> | null
  /** Physical dimensions and weight */
  dimensions?: {
    weight?: number | null   // grams
    length?: number | null   // cm
    width?: number | null    // cm
    height?: number | null   // cm
  } | null
  /** Cost/price information */
  price?: {
    totalAmount?: number | null
    currency?: string | null
  } | null
  labelUrl?: string | null
  reference?: string | null
  companyId?: string | null
  serviceType?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'created':
    case 'pending':
    case 'label_created':
      return 'LABEL_CREATED'
    case 'in_transit':
    case 'em_transito':
    case 'in transit':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'em_rota':
    case 'saiu_para_entrega':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'entregue':
      return 'DELIVERED'
    case 'cancelled':
    case 'cancelado':
      return 'CANCELLED'
    case 'returned':
    case 'devolvido':
    case 'return_to_sender':
      return 'RETURNED'
    case 'exception':
    case 'falha':
    case 'failed':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: LoggiPackage): Shipment {
  const dims = raw.dimensions
  return {
    id: raw.loggiKey ?? raw.trackingCode ?? undefined,
    status: mapShipmentStatus(raw.status ?? raw.statusCode),
    trackingNumber: raw.trackingCode ?? undefined,
    carrierId: 'loggi',
    serviceCode: raw.serviceType ?? undefined,
    originAddress: toAddress(raw.sender as Record<string, unknown> | null),
    destinationAddress: toAddress(raw.recipient as Record<string, unknown> | null),
    totalWeight: toWeight(dims?.weight, 'g'),
    dimensions: toDimensions(dims?.length, dims?.width, dims?.height, 'cm'),
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    actualDeliveryAt: toISODate(raw.deliveredAt),
    labelUrl: raw.labelUrl ?? undefined,
    cost: raw.price?.totalAmount != null
      ? {
          amount: parseDecimal(raw.price.totalAmount) ?? 0,
          currency: (raw.price.currency as string | undefined) ?? 'BRL',
        }
      : undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
