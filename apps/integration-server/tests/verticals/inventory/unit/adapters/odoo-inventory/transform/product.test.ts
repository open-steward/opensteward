/**
 * product.product rows as search_read returns them: a Many2one reads as
 * `[id, display_name]` and an empty field of any type as `false` (the
 * search_read example on the 19.0 external_rpc_api page). Field names are
 * from addons/product/models/product_product.py and product_template.py, 19.0.
 */
import { describe, expect, it } from 'vitest'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'
import {
  PRODUCT_FIELDS,
  transformProduct,
  type RawOdooProduct,
} from '../../../../../../../src/verticals/inventory/adapters/odoo-inventory/transform/product'

const row: RawOdooProduct = {
  id: 42,
  name: 'Large Cabinet',
  default_code: 'E-COM07',
  barcode: '1234567890123',
  categ_id: [8, 'All / Saleable / Office Furniture'],
  lst_price: 320.5,
  currency_id: [1, 'USD'],
  standard_price: 800,
  cost_currency_id: [1, 'USD'],
  active: true,
  product_tmpl_id: [30, 'Large Cabinet'],
  create_date: '2026-01-15 09:30:00',
  write_date: '2026-02-01 14:20:00',
}

describe('odoo-inventory transformProduct', () => {
  it('maps a documented product.product row onto the canonical Product', () => {
    const p = ProductSchema.parse(transformProduct(row))
    expect(p).toMatchObject({
      id: '42',
      externalId: '42',
      sku: 'E-COM07',
      name: 'Large Cabinet',
      category: 'All / Saleable / Office Furniture',
      retailPrice: { amount: 32050, currency: 'USD' },
      cost: { amount: 80000, currency: 'USD' },
      isActive: true,
      supplierIds: [],
      createdAt: '2026-01-15T09:30:00.000Z',
      updatedAt: '2026-02-01T14:20:00.000Z',
      platform: 'odoo-inventory',
    })
    expect(p.metadata).toEqual({ barcode: '1234567890123', productTemplateId: '30' })
  })

  it('reads every empty field as false without inventing values', () => {
    const p = ProductSchema.parse(
      transformProduct({
        id: 5,
        name: 'Service',
        default_code: false,
        barcode: false,
        categ_id: false,
        lst_price: 0,
        currency_id: false,
        standard_price: 0,
        cost_currency_id: false,
        active: false,
        product_tmpl_id: [5, 'Service'],
        create_date: false,
        write_date: false,
      }),
    )
    expect(p.sku).toBe('')
    expect(p.category).toBeUndefined()
    expect(p.retailPrice).toBeUndefined()
    expect(p.cost).toBeUndefined()
    expect(p.isActive).toBe(false)
    expect(p.createdAt).toBeUndefined()
  })

  it('reads Odoo datetimes as UTC whatever the host zone ("must be UTC-only", 19.0 ORM reference)', () => {
    const tz = process.env['TZ']
    process.env['TZ'] = 'America/New_York'
    try {
      expect(transformProduct(row).createdAt).toBe('2026-01-15T09:30:00.000Z')
    } finally {
      process.env['TZ'] = tz
    }
  })

  it('drops a price whose currency display name is not an ISO 4217 code instead of failing the product', () => {
    const p = ProductSchema.parse(transformProduct({ ...row, currency_id: [1, 'Euro'] }))
    expect(p.retailPrice).toBeUndefined()
    expect(p.cost).toEqual({ amount: 80000, currency: 'USD' })
  })

  it('asks only for fields the models define', () => {
    expect(PRODUCT_FIELDS).toEqual([
      'id',
      'name',
      'default_code',
      'barcode',
      'categ_id',
      'lst_price',
      'currency_id',
      'standard_price',
      'cost_currency_id',
      'active',
      'product_tmpl_id',
      'create_date',
      'write_date',
    ])
  })
})

describe('odoo-inventory transformProduct isActive', () => {
  it('is active only when Odoo says active is true', () => {
    const { active: _a, ...noActive } = row
    expect(transformProduct(noActive as RawOdooProduct).isActive).toBe(false)
  })
})
