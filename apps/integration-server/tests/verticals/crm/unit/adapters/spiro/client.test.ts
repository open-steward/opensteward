import { describe, it, expect } from 'vitest'
import { relatedId } from '../../../../../../src/verticals/crm/adapters/spiro/client'

describe('spiro relatedId', () => {
  it('reads a to-one relationship id', () => {
    expect(
      relatedId({ relationships: { user: { data: { id: '9', type: 'user' } } } }, 'user'),
    ).toBe('9')
  })

  it('is undefined for a to-many relationship, never its first member', () => {
    const many = {
      data: [
        { id: '1', type: 'contact' },
        { id: '2', type: 'contact' },
      ],
    }
    expect(relatedId({ relationships: { contacts: many } }, 'contacts')).toBeUndefined()
  })

  it('is undefined for an empty or absent relationship', () => {
    expect(relatedId({ relationships: { user: { data: null } } }, 'user')).toBeUndefined()
    expect(relatedId({}, 'user')).toBeUndefined()
  })
})
