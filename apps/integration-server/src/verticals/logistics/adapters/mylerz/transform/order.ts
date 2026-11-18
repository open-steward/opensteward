import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

/**
 * Raw shape returned by POST /Orders/AddOrders response Packages array
 * and GET /Packages/GetPackageDetails
 * Confirmed via Mylerz API v1.3.1 documentation.
 */
export interface MylerzPackageRaw {
  packageNo?: string | null
  BarCode?: string | null
  Status?: string | null
  ErrorCode?: string | null
  ErrorMessage?: string | null
  Description?: string | null
  ServiceType?: string | null
  ServiceDate?: string | null
  DeliveryCost?: number | null
  COD_Value?: number | null
  Reference?: string | null
  Customer_Name?: string | null
  Mobile_No?: string | null
  Address?: string | null
  City?: string | null
  Zone?: string | null
  WarehouseName?: string | null
  Pieces?: number | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export interface MylerzOrdersResponse {
  PickupOrderCode?: string | null
  Packages?: MylerzPackageRaw[]
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'PENDING'
  const s = status.toUpperCase()
  if (s.includes('DELIVERED')) return 'DELIVERED'
  if (s.includes('SHIPPED') || s.includes('OUT') || s.includes('COURIER')) return 'SHIPPED'
  if (s.includes('TRANSIT') || s.includes('TRANSFER')) return 'SHIPPED'
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('RETURN')) return 'RETURNED'
  if (s.includes('HOLD')) return 'ON_HOLD'
  if (s.includes('PROCESS') || s.includes('PICKED')) return 'PROCESSING'
  if (s.includes('AWAIT') || s.includes('READY')) return 'AWAITING_SHIPMENT'
  if (s.includes('CREAT') || s.includes('PENDING') || s.includes('REGISTERED') || s.includes('NEW'))
    return 'PENDING'
  return 'PENDING'
}

export function transformOrder(raw: MylerzPackageRaw, pickupOrderCode?: string | null): Order {
  const destAddr =
    raw.Customer_Name || raw.Address || raw.City
      ? {
          name: raw.Customer_Name ?? undefined,
          phone: raw.Mobile_No ?? undefined,
          street1: raw.Address ?? undefined,
          city: raw.City ?? undefined,
          state: raw.Zone ?? undefined,
        }
      : undefined

  return {
    id: raw.BarCode ?? raw.packageNo ?? undefined,
    orderNumber: raw.Reference ?? raw.BarCode ?? pickupOrderCode ?? undefined,
    status: mapOrderStatus(raw.Status),
    warehouseId: raw.WarehouseName ?? undefined,
    destinationAddress: destAddr,
    requestedServiceCode: raw.ServiceType ?? undefined,
    totalAmount: raw.COD_Value ?? raw.DeliveryCost ?? undefined,
    notes: raw.Description ?? undefined,
    shippedAt: toISODate(raw.ServiceDate),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * `PackageDetailsResponseDTO`, the Value of
 * GET api/packages/GetPackageDetails?AWB={AWB}
 * (https://integration.mylerz.net/Help/Api/GET-api-packages-GetPackageDetails_AWB).
 * Only the fields this transform reads are typed; the rest stay in metadata.
 */
export interface MylerzPackageDetailsRaw {
  Barcode?: string | null
  Description?: string | null
  ServiceType?: string | null
  CustomerName?: string | null
  MobileNo?: string | null
  CustomerAddress?: string | null
  CityName?: string | null
  Status?: string | null
  ReferenceNumber?: string | null
  [key: string]: unknown
}

/**
 * A package read back by its AWB. Mylerz documents neither its Status values
 * nor the currency of DeliveryCost, so status and amounts are left out; both
 * stay in metadata.
 */
export function transformPackageDetails(raw: MylerzPackageDetailsRaw, awb: string): Order {
  const hasAddress = raw.CustomerName || raw.MobileNo || raw.CustomerAddress || raw.CityName
  return {
    id: raw.Barcode ?? awb,
    orderNumber: raw.ReferenceNumber ?? undefined,
    destinationAddress: hasAddress
      ? {
          name: raw.CustomerName ?? undefined,
          phone: raw.MobileNo ?? undefined,
          street1: raw.CustomerAddress ?? undefined,
          city: raw.CityName ?? undefined,
        }
      : undefined,
    requestedServiceCode: raw.ServiceType ?? undefined,
    notes: raw.Description ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
