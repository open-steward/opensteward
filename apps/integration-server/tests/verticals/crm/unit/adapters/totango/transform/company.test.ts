/**
 * Totango account search hit → canonical Company.
 *
 * Fixture: the sample response of POST /api/v1/search/accounts in
 * https://support.totango.com/hc/en-us/articles/204174135-Search-API-accounts-and-users
 * (fetched as https://support.totango.com/api/v2/help_center/en-us/articles/204174135.json):
 *
 *   {"name":"19934", // account-id
 *   "display_name":"ACME Inc", //  account-name
 *   "last_activity_time":1421422240000,
 *   "selected_fields":[ // requested fields
 */
import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  type RawTotangoAccount,
} from '../../../../../../../src/verticals/crm/adapters/totango/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function documentedHit(): RawTotangoAccount {
  return {
    name: '19934',
    display_name: 'ACME Inc',
    last_activity_time: 1421422240000,
    selected_fields: [
      'red',
      { health: 'red', health_prev: 'green', change_date: 1421614799999 },
      'George Xami',
    ],
  }
}

describe('totango transformCompany', () => {
  it('parses the documented sample hit with CompanySchema', () => {
    const out = CompanySchema.parse(transformCompany(documentedHit()))
    expect(out.id).toBe('19934')
    expect(out.name).toBe('ACME Inc')
  })

  it('takes the id from `name` (account-id) and the name from `display_name`', () => {
    const out = transformCompany({ ...documentedHit(), name: 'acc-7', display_name: 'Globex' })
    expect(out.id).toBe('acc-7')
    expect(out.name).toBe('Globex')
  })

  it('maps nothing it was not documented to carry', () => {
    const out = transformCompany(documentedHit())
    expect(Object.keys(out).sort()).toEqual(['id', 'metadata', 'name'])
  })

  it('keeps the raw hit, selected_fields included, as metadata', () => {
    const raw = documentedHit()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('throws on a hit without the account-id rather than inventing one', () => {
    const raw = { ...documentedHit(), name: undefined } as unknown as RawTotangoAccount
    expect(() => transformCompany(raw)).toThrow(/account-id/)
  })

  it('throws on a hit without the account name rather than inventing one', () => {
    const raw = { ...documentedHit(), display_name: undefined } as unknown as RawTotangoAccount
    expect(() => transformCompany(raw)).toThrow(/display_name/)
  })
})
