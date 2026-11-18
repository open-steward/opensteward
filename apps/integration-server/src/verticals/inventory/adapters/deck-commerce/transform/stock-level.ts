/**
 * Deck Commerce inventory lookup response → StockLevel.
 *
 * Deck Commerce publishes no API reference. The response fields read here are
 * the ones its own Magento module reads from `api/PimInventoryLookup`
 * (github.com/DeckCommerce/magento, Model/Import/InventoryCheck.php):
 *
 *   foreach ($qtyData['Items'] as $item) {
 *     if ($item && isset($item['TotalAvailableQuantity'])) {
 *       ... $item['DeckSKU'] ...
 *       foreach ($item['Details'] as $itemSource) {
 *         $sourceAvailableQty = (int) ($itemSource['TotalQuantity'] - $itemSource['InventoryAllocation']);
 *         $qtys[$item['DeckSKU']][$itemSource['WarehouseCode']] = $sourceAvailableQty;
 *
 * expandStockLevels emits one StockLevel per SKU per warehouse (Details[]).
 * quantityAvailable is TotalQuantity - InventoryAllocation exactly as the
 * vendor computes it, which is the schema's "on-hand minus committed": so
 * TotalQuantity is on hand and InventoryAllocation is committed. An item
 * without TotalAvailableQuantity is skipped, as the vendor's client skips it.
 * An item without Details carries only TotalAvailableQuantity, an available
 * figure (the vendor's single-source path writes it as the sellable quantity),
 * and no documented on-hand quantity, so it throws rather than invent the
 * required quantityOnHand.
 */
import type { StockLevel } from '../../../schema/stock-level'
import { strMap } from './shared'

export interface RawDeckCommerceInventoryDetail {
  WarehouseCode?: string
  TotalQuantity?: number
  InventoryAllocation?: number
  [key: string]: unknown
}

export interface RawDeckCommerceStockLevel {
  DeckSKU: string
  TotalAvailableQuantity?: number
  Details?: RawDeckCommerceInventoryDetail[]
  [key: string]: unknown
}

function requireNumber(value: unknown, field: string, sku: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`deck-commerce: inventory lookup for SKU ${sku} has no numeric ${field}`)
  }
  return value
}

/** Expand a single Items[] element into one StockLevel per warehouse Detail, or one per SKU. */
export function expandStockLevels(raw: RawDeckCommerceStockLevel): StockLevel[] {
  if (typeof raw.TotalAvailableQuantity !== 'number') return []
  const sku = raw.DeckSKU
  if (typeof sku !== 'string' || sku === '') {
    throw new Error('deck-commerce: inventory lookup item has no DeckSKU')
  }
  if (raw.Details && raw.Details.length > 0) {
    return raw.Details.map((d) => {
      const warehouseCode = d.WarehouseCode
      if (typeof warehouseCode !== 'string' || warehouseCode === '') {
        throw new Error(
          `deck-commerce: inventory lookup for SKU ${sku} has a detail without WarehouseCode`,
        )
      }
      const total = requireNumber(d.TotalQuantity, 'TotalQuantity', sku)
      const allocated = requireNumber(d.InventoryAllocation, 'InventoryAllocation', sku)
      return {
        id: `${sku}:${warehouseCode}`,
        productId: sku,
        locationId: warehouseCode,
        quantityOnHand: total,
        quantityAvailable: total - allocated,
        quantityCommitted: allocated,
        platform: 'deck-commerce',
        metadata: strMap({ warehouseCode }),
        raw: d,
      } satisfies StockLevel
    })
  }
  throw new Error(
    `deck-commerce: inventory lookup for SKU ${sku} has no warehouse Details; ` +
      'TotalAvailableQuantity is an available figure and no on-hand quantity is documented',
  )
}
