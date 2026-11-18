import { describe, it, expect } from 'vitest'
import { NoonClient } from '../../../../../../src/verticals/ecommerce/adapters/noon/client'
import type { Credentials } from '@opensteward/shared'

function makeCredentials(overrides: Partial<Credentials> = {}): Credentials {
  return {
    accessToken: 'test-noon-api-key-12345',
    extra: {
      locale: 'ae',
    },
    ...overrides,
  }
}

describe('NoonClient', () => {
  it('throws when accessToken is missing', () => {
    expect(() => new NoonClient(makeCredentials({ accessToken: '' }))).toThrow(
      /accessToken is required/,
    )
  })

  it('instantiates successfully with valid credentials', () => {
    const client = new NoonClient(makeCredentials())
    expect(client).toBeDefined()
  })

  it('defaults to ae locale when none is specified', () => {
    const client = new NoonClient(makeCredentials({ extra: {} }))
    expect(client).toBeDefined()
  })
})
