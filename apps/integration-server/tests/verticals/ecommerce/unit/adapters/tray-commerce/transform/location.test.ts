/**
 * Docs: https://developers.tray.com.br/ `#listagem-de-cd-get`,
 * `#consultar-cd-get` — fetched with curl; see `transform/location.ts`
 * header for the confirmed Multi-CD JSON shape.
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawTrayCd,
} from '../../../../../../../src/verticals/ecommerce/adapters/tray-commerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeCd(overrides: Partial<RawTrayCd> = {}): RawTrayCd {
  return {
    id: 351,
    name: 'D Eletrônicos',
    main: true,
    status: true,
    postal_code: '16015-244',
    country: 'Brasil',
    state: 'SP',
    city: 'Araçatuba',
    address: 'Rua Cristiano Olsen até 1300/1301',
    number: '1067',
    neighborhood: 'teste',
    complement: '',
    ...overrides,
  }
}

describe('transformLocation (Tray Commerce Multi-CD)', () => {
  it('maps id and name', () => {
    const result = transformLocation(makeCd())
    expect(result.id).toBe('351')
    expect(result.name).toBe('D Eletrônicos')
  })

  it('maps the genuine JSON boolean `status` to active', () => {
    expect(transformLocation(makeCd({ status: true })).active).toBe(true)
    expect(transformLocation(makeCd({ status: false })).active).toBe(false)
  })

  it('maps `main` to isFulfillmentCenter', () => {
    expect(transformLocation(makeCd({ main: true })).isFulfillmentCenter).toBe(true)
  })

  it('maps address fields and hardcodes country to BR (Tray is Brazil-only; `country` in the docs is free-text "Brasil", not ISO)', () => {
    const result = transformLocation(makeCd())
    expect(result.address).toEqual({
      line1: 'Rua Cristiano Olsen até 1300/1301',
      line2: '',
      city: 'Araçatuba',
      region: 'SP',
      postalCode: '16015-244',
      country: 'BR',
    })
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCd()
    expect(transformLocation(raw).metadata).toBe(raw)
  })

  it('produces a payload satisfying LocationSchema', () => {
    expect(() => LocationSchema.parse(transformLocation(makeCd()))).not.toThrow()
  })
})
