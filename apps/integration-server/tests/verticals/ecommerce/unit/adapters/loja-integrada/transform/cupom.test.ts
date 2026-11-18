import { describe, it, expect } from 'vitest'
import {
  transformCupom,
  type RawLojaIntegradaCupom,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/cupom'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'
import { CUPOM_DETAIL, CUPOM_LIST_OBJECT } from '../fixtures'

describe('transformCupom (loja-integrada)', () => {
  it('maps a documented GET /v1/cupom row to a valid Discount', () => {
    const d = DiscountSchema.parse(transformCupom(CUPOM_LIST_OBJECT as RawLojaIntegradaCupom))
    expect(d).toMatchObject({
      id: '1178843',
      code: '02022022',
      title: 'cupom02-02-2022',
      type: 'PERCENTAGE',
      value: 10,
      customerEligibility: 'ALL',
      usageLimit: 99,
      usageCount: 1,
    })
    expect(d.minimumPurchaseAmount).toBeUndefined()
    expect(d.endsAt).toBeUndefined()
  })

  it('maps the single-coupon answer: selected groups and products', () => {
    const d = DiscountSchema.parse(transformCupom(CUPOM_DETAIL as RawLojaIntegradaCupom))
    expect(d.customerEligibility).toBe('SPECIFIC')
    expect(d.productIds).toEqual(['183623529', '183610329'])
    expect(d.collectionIds).toEqual([])
    expect(d.value).toBe(15)
  })

  it('maps the other documented tipo values, and gives no value to a fixed amount', () => {
    const fixo = DiscountSchema.parse(
      transformCupom({ ...(CUPOM_LIST_OBJECT as RawLojaIntegradaCupom), tipo: 'fixo' }),
    )
    expect(fixo.type).toBe('FIXED_AMOUNT')
    expect(fixo.value).toBeUndefined()
    const frete = DiscountSchema.parse(
      transformCupom({ ...(CUPOM_LIST_OBJECT as RawLojaIntegradaCupom), tipo: 'frete_gratis' }),
    )
    expect(frete.type).toBe('FREE_SHIPPING')
    const other = DiscountSchema.parse(
      transformCupom({ ...(CUPOM_LIST_OBJECT as RawLojaIntegradaCupom), tipo: 'outro' }),
    )
    expect(other.type).toBe('unknown')
  })

  it('maps selected customers to SPECIFIC, and an undocumented condicao_cliente to unknown', () => {
    const base = CUPOM_LIST_OBJECT as RawLojaIntegradaCupom
    expect(
      DiscountSchema.parse(transformCupom({ ...base, condicao_cliente: 'clientes_selecionados' }))
        .customerEligibility,
    ).toBe('SPECIFIC')
    expect(
      DiscountSchema.parse(transformCupom({ ...base, condicao_cliente: 'outra' }))
        .customerEligibility,
    ).toBe('unknown')
  })
})
