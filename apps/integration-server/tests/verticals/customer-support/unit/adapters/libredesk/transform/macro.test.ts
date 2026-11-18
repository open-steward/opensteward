import { describe, it, expect } from 'vitest'
import {
  transformMacro,
  type RawLibredeskMacro,
} from '../../../../../../../src/verticals/customer-support/adapters/libredesk/transform/macro'
import { MacroSchema } from '../../../../../../../src/verticals/customer-support/schema/macro'

describe('libredesk transformMacro', () => {
  it('maps id and externalId from raw.id', () => {
    const raw: RawLibredeskMacro = { id: 5, name: 'Reset PW', message_content: 'Please reset.' }
    const result = transformMacro(raw)
    expect(result.id).toBe('5')
    expect(result.externalId).toBe('5')
  })

  it('maps name to title', () => {
    const raw: RawLibredeskMacro = { id: 1, name: 'Greeting', message_content: 'Hello!' }
    const result = transformMacro(raw)
    expect(result.title).toBe('Greeting')
  })

  it('maps message_content to body', () => {
    const raw: RawLibredeskMacro = {
      id: 2,
      name: 'Closing',
      message_content: 'Thank you for contacting us.',
    }
    const result = transformMacro(raw)
    expect(result.body).toBe('Thank you for contacting us.')
  })

  it('maps visibility to category', () => {
    const raw: RawLibredeskMacro = {
      id: 3,
      name: 'Team macro',
      message_content: 'body',
      visibility: 'team',
    }
    const result = transformMacro(raw)
    expect(result.category).toBe('team')
  })

  it('sets category to undefined when visibility is absent', () => {
    const raw: RawLibredeskMacro = { id: 4, name: 'No vis', message_content: 'body' }
    const result = transformMacro(raw)
    expect(result.category).toBeUndefined()
  })

  it('sets platform to libredesk', () => {
    const raw: RawLibredeskMacro = { id: 5, name: 'X', message_content: 'Y' }
    const result = transformMacro(raw)
    expect(result.platform).toBe('libredesk')
  })

  it('passes MacroSchema validation', () => {
    const raw: RawLibredeskMacro = {
      id: 99,
      name: 'Valid Macro',
      message_content: 'The canned response body.',
      visibility: 'global',
    }
    const result = transformMacro(raw)
    expect(() => MacroSchema.parse(result)).not.toThrow()
  })
})
