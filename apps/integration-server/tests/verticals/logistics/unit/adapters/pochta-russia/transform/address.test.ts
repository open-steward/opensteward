/**
 * The flat `*-to` / `*-from` address fields the Otpravka specification
 * documents on an отправление:
 * https://otpravka.pochta.ru/static/views/specification/batches-get_info_about_orders_in_batch.html
 */
import { describe, it, expect } from 'vitest'
import {
  destinationAddress,
  originAddress,
  type PochtaRussiaFlatAddress,
} from '../../../../../../../src/verticals/logistics/adapters/pochta-russia/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

const DOC: PochtaRussiaFlatAddress = {
  'recipient-name': 'Иванов Иван Иванович',
  'index-to': 101000,
  'place-to': 'Москва',
  'region-to': 'Москва',
  'street-to': 'Мясницкая',
  'house-to': '26',
  'room-to': '5',
  'sender-name': 'ООО Ромашка',
  'index-from': '630000',
  'place-from': 'Новосибирск',
  'region-from': 'Новосибирская область',
  'street-from': 'Ленина',
  'house-from': '1',
}

describe('pochta-russia flat addresses', () => {
  it('destinationAddress reads the documented *-to fields', () => {
    expect(AddressSchema.parse(destinationAddress(DOC))).toEqual({
      name: 'Иванов Иван Иванович',
      street1: 'Мясницкая, 26, 5',
      city: 'Москва',
      state: 'Москва',
      postalCode: '101000',
    })
  })

  it('originAddress reads the documented *-from fields', () => {
    expect(AddressSchema.parse(originAddress(DOC))).toEqual({
      name: 'ООО Ромашка',
      street1: 'Ленина, 1',
      city: 'Новосибирск',
      state: 'Новосибирская область',
      postalCode: '630000',
    })
  })

  it('sets no country and is absent when no field is present', () => {
    expect(destinationAddress(DOC)?.country).toBeUndefined()
    expect(destinationAddress({})).toBeUndefined()
    expect(originAddress({ 'place-from': '' })).toBeUndefined()
  })
})
