import { describe, it, expect } from 'vitest'
import {
  transformMacro,
  type RawJitbitCommentTemplate,
} from '../../../../../../../src/verticals/customer-support/adapters/jitbit-helpdesk/transform/macro'
import { MacroSchema } from '../../../../../../../src/verticals/customer-support/schema/macro'

describe('jitbit-helpdesk transformMacro', () => {
  it('maps TemplateId to id and externalId', () => {
    const raw: RawJitbitCommentTemplate = {
      TemplateId: 5,
      Name: 'Reset PW',
      Body: 'Please reset...',
    }
    const result = transformMacro(raw)
    expect(result.id).toBe('5')
    expect(result.externalId).toBe('5')
  })

  it('maps Name to title', () => {
    const raw: RawJitbitCommentTemplate = { TemplateId: 1, Name: 'Greeting', Body: 'Hello!' }
    const result = transformMacro(raw)
    expect(result.title).toBe('Greeting')
  })

  it('maps Body to body', () => {
    const raw: RawJitbitCommentTemplate = {
      TemplateId: 2,
      Name: 'Closing',
      Body: 'Thanks for contacting us.',
    }
    const result = transformMacro(raw)
    expect(result.body).toBe('Thanks for contacting us.')
  })

  it('sets category to undefined (no category in jitbit)', () => {
    const raw: RawJitbitCommentTemplate = { TemplateId: 3, Name: 'X', Body: 'Y' }
    const result = transformMacro(raw)
    expect(result.category).toBeUndefined()
  })

  it('sets platform to jitbit-helpdesk', () => {
    const raw: RawJitbitCommentTemplate = { TemplateId: 4, Name: 'X', Body: 'Y' }
    const result = transformMacro(raw)
    expect(result.platform).toBe('jitbit-helpdesk')
  })

  it('passes MacroSchema validation', () => {
    const raw: RawJitbitCommentTemplate = {
      TemplateId: 99,
      Name: 'Valid Template',
      Body: 'This is the canned response body.',
    }
    const result = transformMacro(raw)
    expect(() => MacroSchema.parse(result)).not.toThrow()
  })
})
