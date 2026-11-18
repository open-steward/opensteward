import { describe, it, expect } from 'vitest'
import {
  transformMacro,
  type RawLivehelpnowCannedItem,
} from '../../../../../../../src/verticals/customer-support/adapters/livehelpnow/transform/macro'
import { MacroSchema } from '../../../../../../../src/verticals/customer-support/schema/macro'

describe('livehelpnow transformMacro', () => {
  it('maps id and externalId from raw.id', () => {
    const raw: RawLivehelpnowCannedItem = { id: 5, title: 'Greeting', message: 'Hello!' }
    const result = transformMacro(raw)
    expect(result.id).toBe('5')
    expect(result.externalId).toBe('5')
  })

  it('maps title to title', () => {
    const raw: RawLivehelpnowCannedItem = {
      id: 1,
      title: 'Password Reset',
      message: 'Please reset.',
    }
    const result = transformMacro(raw)
    expect(result.title).toBe('Password Reset')
  })

  it('maps message to body', () => {
    const raw: RawLivehelpnowCannedItem = {
      id: 2,
      title: 'T',
      message: 'Thank you for contacting us.',
    }
    const result = transformMacro(raw)
    expect(result.body).toBe('Thank you for contacting us.')
  })

  it('maps _setName to category', () => {
    const raw: RawLivehelpnowCannedItem = {
      id: 3,
      title: 'X',
      message: 'Y',
      _setName: 'General Responses',
    }
    const result = transformMacro(raw)
    expect(result.category).toBe('General Responses')
  })

  it('sets category to undefined when _setName absent', () => {
    const raw: RawLivehelpnowCannedItem = { id: 4, title: 'X', message: 'Y' }
    const result = transformMacro(raw)
    expect(result.category).toBeUndefined()
  })

  it('sets platform to livehelpnow', () => {
    const raw: RawLivehelpnowCannedItem = { id: 6, title: 'X', message: 'Y' }
    const result = transformMacro(raw)
    expect(result.platform).toBe('livehelpnow')
  })

  it('passes MacroSchema validation', () => {
    const raw: RawLivehelpnowCannedItem = {
      id: 99,
      title: 'Valid Canned Item',
      message: 'This is the canned response body.',
      _setName: 'Support Responses',
      enabled: true,
    }
    const result = transformMacro(raw)
    expect(() => MacroSchema.parse(result)).not.toThrow()
  })
})
