/**
 * Bind ERP → canonical Order + SalesOrder transform.
 *
 * Source: GET /api/Orders/{id}
 *
 * In Bind ERP, "Orders" (pedidos) represent sales orders — documents
 * sent to customers before invoicing.  There is no dedicated purchase-
 * order endpoint; the Orders API covers only the sales side.
 *
 * Bind ERP OrderDetails fields (SDK v1.2):
 *   ID, ClientID, ClientName, OrderDate, Comments, Number,
 *   Address, StatusCode, Status,
 *   CurrencyName, CurrencyID, ExchangeRate, RFC,
 *   ServiceSubtotal, ProductSubtotal, Discount, VATRate, VAT,
 *   IEPS, IEPSRATE, ISRRet, ISRRetRate, VatRet, VatRetRate, Total,
 *   PriceListName, PriceListID, LocationName, LocationID,
 *   WarehouseID, WarehouseName,
 *   ClientContact, PhoneNumber, EmployeeName, EmployeeID,
 *   DiscountType, PurchaseOrder,
 *   Products[], Services[]
 *
 * OrderDetailsProduct: ProductID, Name, IndexNumber, Code, Unit,
 *   UnitMultiplier, Qty, Price, IEPSRate, Comments, QtyFullFilled, VATRate
 *
 * OrderDetailsService: (same shape)
 */

import type { Order, OrderStatus } from '../../../schema/order'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

// ── Raw Bind ERP types ──────────────────────────────────────────────────────

export interface BindOrderProduct {
  ProductID?: string
  Name?: string
  IndexNumber?: number
  Code?: string
  Unit?: string
  UnitMultiplier?: number
  Qty?: number
  Price?: number
  IEPSRate?: number
  Comments?: string
  QtyFullFilled?: number
  VATRate?: number
  [key: string]: unknown
}

export interface BindOrderService {
  ServiceID?: string
  Name?: string
  IndexNumber?: number
  Code?: string
  Unit?: string
  Qty?: number
  Price?: number
  VATRate?: number
  Comments?: string
  [key: string]: unknown
}

export interface BindOrderDetails {
  ID?: string
  ClientID?: string
  ClientName?: string
  PriceListName?: string
  PriceListID?: string
  LocationName?: string
  LocationID?: string
  WarehouseID?: string
  WarehouseName?: string
  OrderDate?: string
  Comments?: string
  Number?: number
  Address?: string
  ClientContact?: string
  PhoneNumber?: string
  EmployeeName?: string
  EmployeeID?: string
  StatusCode?: number
  PurchaseOrder?: string
  Status?: string
  CurrencyName?: string
  CurrencyID?: string
  ExchangeRate?: number
  RFC?: string
  ServiceSubtotal?: number
  ProductSubtotal?: number
  Discount?: number
  VATRate?: number
  VAT?: number
  DiscountType?: number
  IEPS?: number
  IEPSRATE?: number
  ISRRet?: number
  ISRRetRate?: number
  VatRet?: number
  VatRetRate?: number
  Total?: number
  Products?: BindOrderProduct[]
  Services?: BindOrderService[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapOrderStatus(code?: number, status?: string): OrderStatus {
  if (code === 2 || status === 'Cancelado') return 'CANCELLED'
  if (code === 3 || status === 'Completado' || status === 'Facturado') return 'COMPLETED'
  if (code === 1 || status === 'Abierto' || status === 'Activo') return 'ACTIVE'
  return 'DRAFT'
}

function mapSalesOrderStatus(code?: number, status?: string): SalesOrderStatus {
  if (code === 2 || status === 'Cancelado') return 'CANCELLED'
  if (code === 3 || status === 'Completado' || status === 'Facturado') return 'COMPLETED'
  if (code === 1 || status === 'Abierto' || status === 'Activo') return 'ACTIVE'
  return 'DRAFT'
}

function productToLineitem(p: BindOrderProduct): Lineitem {
  return {
    id: p.IndexNumber !== undefined ? String(p.IndexNumber) : undefined,
    itemId: p.ProductID || undefined,
    itemName: p.Name || undefined,
    itemSku: p.Code || undefined,
    unitAmount: p.Price,
    unitQuantity: p.Qty !== undefined ? Math.round(p.Qty) : undefined,
    discountAmount: undefined,
  }
}

function serviceToLineitem(s: BindOrderService): Lineitem {
  return {
    id: s.IndexNumber !== undefined ? String(s.IndexNumber) : undefined,
    itemId: s.ServiceID || undefined,
    itemName: s.Name || undefined,
    itemSku: s.Code || undefined,
    unitAmount: s.Price,
    unitQuantity: s.Qty !== undefined ? Math.round(s.Qty) : undefined,
  }
}

function buildLineitems(raw: BindOrderDetails): Lineitem[] {
  const products = (raw.Products ?? []).map(productToLineitem)
  const services = (raw.Services ?? []).map(serviceToLineitem)
  return [...products, ...services]
}

// ── Transforms ───────────────────────────────────────────────────────────────

/** Transform a Bind ERP Order (pedido) → canonical Order */
export function transformOrder(raw: BindOrderDetails): Order {
  const lineItems = buildLineitems(raw)
  const total = raw.Total ?? (raw.ProductSubtotal ?? 0) + (raw.ServiceSubtotal ?? 0) - (raw.Discount ?? 0) + (raw.VAT ?? 0)

  return {
    id: raw.ID || (raw.Number ? String(raw.Number) : ''),
    status: mapOrderStatus(raw.StatusCode, raw.Status),
    type: 'SALES',
    contactId: raw.ClientID || undefined,
    currency: raw.CurrencyName || raw.CurrencyID || undefined,
    totalAmount: total || undefined,
    lineItems: lineItems.length ? lineItems : undefined,
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Transform a Bind ERP Order (pedido) → canonical SalesOrder */
export function transformSalesOrder(raw: BindOrderDetails): SalesOrder {
  const lineItems = buildLineitems(raw)
  const total = raw.Total ?? (raw.ProductSubtotal ?? 0) + (raw.ServiceSubtotal ?? 0) - (raw.Discount ?? 0) + (raw.VAT ?? 0)

  return {
    id: raw.ID || (raw.Number ? String(raw.Number) : ''),
    status: mapSalesOrderStatus(raw.StatusCode, raw.Status),
    contactId: raw.ClientID || undefined,
    currency: raw.CurrencyName || raw.CurrencyID || undefined,
    totalAmount: total || undefined,
    lineItems: lineItems.length ? lineItems : undefined,
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
