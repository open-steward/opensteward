/**
 * Falabella warehouse stock → canonical InventoryLevel.
 *
 * `GetStock` (docs: https://developers.falabella.com/docs/products/getstock)
 * returns, verbatim per the docs' own XML example (envelope
 * `SuccessResponse.Body.Stocks`):
 *
 *   <Stocks>
 *     <SellerWarehouses><Warehouse><SellerWarehouseId>ID01</SellerWarehouseId>
 *       <FacilityID>...</FacilityID><SellerSku>Test1</SellerSku><Quantity>138</Quantity>
 *     </Warehouse></SellerWarehouses>
 *     <FulfillmentWarehouses><Warehouse><WarehouseId>6001</WarehouseId>
 *       <Quantity>2</Quantity><WarehouseName>San Bernardo</WarehouseName>
 *       <SellerSku>Test1</SellerSku></Warehouse></FulfillmentWarehouses>
 *   </Stocks>
 *
 * Two distinct location id spaces are both real: seller-fulfilled stock is
 * keyed by `SellerWarehouseId`, Falabella-fulfilled (FBF) stock by
 * `WarehouseId` — this adapter surfaces both as separate `InventoryLevel`
 * rows rather than picking one arbitrarily.
 *
 * `UpdateStock` (docs:
 * https://developers.falabella.com/docs/products/updatestock) sets an
 * ABSOLUTE quantity — "Unidades de stock asignados a la bodega" — there is
 * no delta operation, so `adjustInventoryLevel` is declared unavailable.
 * Confirmed request XML: `<Request><Warehouse><Stock><SellerSku>abc02</SellerSku>
 * <Quantity>234</Quantity></Stock></Warehouse></Request>`.
 */
import type { InventoryLevel } from '../../../schema/inventory'

export interface RawFalabellaSellerWarehouseStock {
  SellerWarehouseId: string
  SellerSku: string
  Quantity: number
}

export interface RawFalabellaFulfillmentWarehouseStock {
  WarehouseId: string
  SellerSku: string
  Quantity: number
}

export function transformSellerWarehouseStock(raw: RawFalabellaSellerWarehouseStock): InventoryLevel {
  return {
    id: `${raw.SellerSku}:${raw.SellerWarehouseId}`,
    variantId: raw.SellerSku,
    locationId: raw.SellerWarehouseId,
    available: raw.Quantity,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformFulfillmentWarehouseStock(
  raw: RawFalabellaFulfillmentWarehouseStock,
): InventoryLevel {
  return {
    id: `${raw.SellerSku}:${raw.WarehouseId}`,
    variantId: raw.SellerSku,
    locationId: raw.WarehouseId,
    available: raw.Quantity,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Body for `POST ?Action=UpdateStock` — one `<Stock>` entry, raw XML (verbatim shape per the docs' own example). */
export function untransformInventoryLevel(data: {
  variantId: string
  available: number
  locationId?: string
}): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Request><Warehouse><Stock>` +
    `<SellerSku>${data.variantId}</SellerSku>` +
    `<Quantity>${data.available}</Quantity>` +
    (data.locationId ? `<SellerWarehouseId>${data.locationId}</SellerWarehouseId>` : '') +
    `</Stock></Warehouse></Request>`
  )
}
