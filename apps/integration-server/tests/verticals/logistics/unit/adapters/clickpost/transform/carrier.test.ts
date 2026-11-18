import { describe, it, expect } from 'vitest'
import {
  transformCarriers,
  type ClickPostAccount,
} from '../../../../../../../src/verticals/logistics/adapters/clickpost/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

/**
 * `result.accounts` of the documented 200 example of GET /api/v1/fetch-accounts
 * (https://docs.clickpost.ai/reference/fetch-accounts-from-clickpost-1).
 */
const DOC_ACCOUNTS: ClickPostAccount[] = [
  {
    courier_partner_id: 4,
    courier_name: 'Delhivery',
    account_code: 'Delhivery_Surface_Heavy',
    account_active: true,
  },
  {
    courier_partner_id: 4,
    courier_name: 'Delhivery',
    account_code: 'Delhivery_Surface_B2C',
    account_active: true,
  },
  {
    courier_partner_id: 4,
    courier_name: 'Delhivery',
    account_code: 'Delhivery_Express_B2C',
    account_active: true,
  },
  {
    courier_partner_id: 4,
    courier_name: 'Delhivery',
    account_code: 'Delhivery_Surface_Bulk',
    account_active: true,
  },
  {
    courier_partner_id: 58,
    courier_name: 'Critical Log',
    account_code: 'Acme_criticallog',
    account_active: true,
  },
  {
    courier_partner_id: 6,
    courier_name: 'XpressBees',
    account_code: 'Xpressbees_Surface',
    account_active: true,
  },
  {
    courier_partner_id: 6,
    courier_name: 'XpressBees',
    account_code: 'Xpressbees_Express',
    account_active: true,
  },
  {
    courier_partner_id: 3,
    courier_name: 'EcomExpress',
    account_code: 'EcomExpress_Surface',
    account_active: true,
  },
  {
    courier_partner_id: 55,
    courier_name: 'Ekart',
    account_code: 'Ekart_Surface',
    account_active: true,
  },
]

describe('clickpost transformCarriers', () => {
  it('returns one carrier per courier_partner_id, in first-seen order', () => {
    const carriers = transformCarriers(DOC_ACCOUNTS)
    expect(carriers.map((c) => c.id)).toEqual(['4', '58', '6', '3', '55'])
    for (const c of carriers) CarrierSchema.parse(c)
  })

  it('maps the partner id to id and code, courier_name to name, accounts to services', () => {
    const [delhivery] = transformCarriers(DOC_ACCOUNTS)
    expect(CarrierSchema.parse(delhivery)).toMatchObject({
      id: '4',
      code: '4',
      name: 'Delhivery',
      isActive: true,
      services: [
        { code: 'Delhivery_Surface_Heavy' },
        { code: 'Delhivery_Surface_B2C' },
        { code: 'Delhivery_Express_B2C' },
        { code: 'Delhivery_Surface_Bulk' },
      ],
    })
  })

  it('is active when any of its accounts is active, inactive when none is', () => {
    const mixed = transformCarriers([
      { courier_partner_id: 9, account_code: 'a', account_active: false },
      { courier_partner_id: 9, account_code: 'b', account_active: true },
    ])[0]
    expect(CarrierSchema.parse(mixed).isActive).toBe(true)
    const off = transformCarriers([
      { courier_partner_id: 9, account_code: 'a', account_active: false },
    ])[0]
    expect(CarrierSchema.parse(off).isActive).toBe(false)
  })

  it('omits what the account rows do not carry instead of inventing it', () => {
    const bare = CarrierSchema.parse(transformCarriers([{ courier_partner_id: 7 }])[0])
    expect(bare.id).toBe('7')
    expect(bare.name).toBeUndefined()
    expect(bare.isActive).toBeUndefined()
    expect(bare.services).toEqual([])
  })

  it('returns no carriers for no accounts', () => {
    expect(transformCarriers([])).toEqual([])
  })
})
