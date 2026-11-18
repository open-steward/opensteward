/**
 * Pins the fixed request shape: the production
 * and sandbox hosts actually construct the client with (`config.sandbox`
 * used to be declared and never read), the `getTrackingEvents` request
 * (path + query, keyed by the Easyship shipment id, not the old undocumented
 * `tracking/{n}`), and the `createLabel` request (path + body, no more
 * `POST /labels` which does not exist).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getMock, postMock, ClientCtor } = vi.hoisted(() => {
  const getMock = vi.fn()
  const postMock = vi.fn()
  const ClientCtor = vi.fn().mockImplementation(function EasyshipClientMock() {
    return { get: getMock, post: postMock }
  })
  return { getMock, postMock, ClientCtor }
})

vi.mock('../../../../../../src/verticals/logistics/adapters/easyship/client', () => ({
  EasyshipClient: ClientCtor,
}))

import { EasyshipAdapter } from '../../../../../../src/verticals/logistics/adapters/easyship'
import {
  EASYSHIP_API_BASE,
  EASYSHIP_SANDBOX_API_BASE,
} from '../../../../../../src/verticals/logistics/adapters/easyship/constants'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

const credentials = { accessToken: 'TEST_token' } as Credentials

beforeEach(() => {
  ClientCtor.mockClear()
  getMock.mockReset()
  postMock.mockReset()
})

describe('EasyshipAdapter — host', () => {
  it('constructs the client on the production host by default', async () => {
    getMock.mockResolvedValueOnce({ shipments: [] })
    const adapter = new EasyshipAdapter()
    await adapter.getTrackingEvents(credentials, 'SHP-1')
    expect(ClientCtor).toHaveBeenCalledWith(credentials, EASYSHIP_API_BASE)
    expect(EASYSHIP_API_BASE).toBe('https://public-api.easyship.com/2024-09/')
  })

  it('constructs the client on the sandbox host when config.sandbox is true', async () => {
    getMock.mockResolvedValueOnce({ shipments: [] })
    const adapter = new EasyshipAdapter({ sandbox: true })
    await adapter.getTrackingEvents(credentials, 'SHP-1')
    expect(ClientCtor).toHaveBeenCalledWith(credentials, EASYSHIP_SANDBOX_API_BASE)
    expect(EASYSHIP_SANDBOX_API_BASE).toBe('https://public-api-sandbox.easyship.com/2024-09/')
  })
})

describe('EasyshipAdapter.getTrackingEvents', () => {
  it('requests shipments/trackings with easyship_shipment_id and include_checkpoints', async () => {
    getMock.mockResolvedValueOnce({ shipments: [] })
    const adapter = new EasyshipAdapter()
    await adapter.getTrackingEvents(credentials, 'SHP-42')
    expect(getMock).toHaveBeenCalledWith('shipments/trackings', {
      easyship_shipment_id: 'SHP-42',
      include_checkpoints: true,
    })
  })
})

describe('EasyshipAdapter.createLabel', () => {
  it('POSTs shipment id in the path and printing_options.format lowercase in the body', async () => {
    postMock.mockResolvedValueOnce({
      shipment: { easyship_shipment_id: 'SHP-42', shipping_documents: [], trackings: [] },
    })
    const adapter = new EasyshipAdapter()
    await adapter.createLabel(credentials, { shipmentId: 'SHP-42', format: 'PDF', serviceCode: 'usps-priority' })
    expect(postMock).toHaveBeenCalledWith('shipments/SHP-42/label', {
      courier_service_id: 'usps-priority',
      printing_options: { format: 'pdf' },
    })
  })

  it('does not send shipment_id or format at the top level of the body', async () => {
    postMock.mockResolvedValueOnce({
      shipment: { easyship_shipment_id: 'SHP-42', shipping_documents: [], trackings: [] },
    })
    const adapter = new EasyshipAdapter()
    await adapter.createLabel(credentials, { shipmentId: 'SHP-42' })
    const body = postMock.mock.calls[0]?.[1] as Record<string, unknown>
    expect(body.shipment_id).toBeUndefined()
    expect(body.format).toBeUndefined()
  })

  it('throws when neither shipmentId nor id is given', async () => {
    const adapter = new EasyshipAdapter()
    await expect(adapter.createLabel(credentials, {})).rejects.toThrow(/shipmentId/)
    expect(postMock).not.toHaveBeenCalled()
  })
})
