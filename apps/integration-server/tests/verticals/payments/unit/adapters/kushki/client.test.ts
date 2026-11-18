import { describe, it, expect, vi } from 'vitest'

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))
vi.mock('axios', () => ({ default: { create: createMock } }))

import { KushkiClient } from '../../../../../../src/verticals/payments/adapters/kushki/client'
import { buildCredentials } from '../../../../../../src/verticals/payments/adapters/kushki/auth'

describe('kushki client auth', () => {
  it('sends the Private Key in Private-Merchant-Id on the production host', () => {
    createMock.mockReturnValue({ get: vi.fn() })
    new KushkiClient(buildCredentials({ apiKey: 'pk_live' }))
    const cfg = createMock.mock.calls[0]![0]
    expect(cfg.baseURL).toBe('https://api.kushkipagos.com')
    expect(cfg.headers['Private-Merchant-Id']).toBe('pk_live')
    expect(cfg.headers.Authorization).toBeUndefined()
  })

  it('refuses a connection with no Private Key', () => {
    expect(() => buildCredentials({})).toThrow(/Private Key/)
  })
})
