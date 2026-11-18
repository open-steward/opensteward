import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawOrderfulRelationship,
} from '../../../../../../../src/verticals/inventory/adapters/orderful/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — orderful', () => {
  const raw: RawOrderfulRelationship = {
    id: 1001,
    status: 'LIVE',
    autoSend: 'true',
    transactionType: { name: '850_PURCHASE_ORDER' },
    sender: { organizationName: 'Buyer Corp', ediAccountId: 202 },
    receiver: {
      ediAccountId: 101,
      organizationName: 'Supplier Corp',
      ediAccountName: 'SUPPLIER_EDI',
      liveIsaId: 'ISA-101',
    },
    createdAt: '2024-03-01T00:00:00Z',
  }
  const result = transformSupplier(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('1001')
  })

  it('maps name from receiver.organizationName', () => {
    expect(result.name).toBe('Supplier Corp')
  })

  it('maps isActive true when status is LIVE', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to orderful', () => {
    expect(result.platform).toBe('orderful')
  })

  it('stores status in metadata', () => {
    expect(result.metadata['status']).toBe('LIVE')
  })

  it('stores transactionType in metadata', () => {
    expect(result.metadata['transactionType']).toBe('850_PURCHASE_ORDER')
  })

  it('stores senderOrganizationName in metadata', () => {
    expect(result.metadata['senderOrganizationName']).toBe('Buyer Corp')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — orderful isActive mapping', () => {
  const activeStatuses = ['READY', 'LIVE', 'TEST']
  const inactiveStatuses = ['BLOCKED', 'PENDING', 'SETUP']

  for (const status of activeStatuses) {
    it(`isActive true for status "${status}"`, () => {
      const raw: RawOrderfulRelationship = { id: 1, status, receiver: {} }
      expect(transformSupplier(raw).isActive).toBe(true)
    })
  }

  for (const status of inactiveStatuses) {
    it(`isActive false for status "${status}"`, () => {
      const raw: RawOrderfulRelationship = { id: 1, status, receiver: {} }
      expect(transformSupplier(raw).isActive).toBe(false)
    })
  }
})

describe('transformSupplier — orderful name fallback chain', () => {
  it('falls back to ediAccountName when organizationName absent', () => {
    const raw: RawOrderfulRelationship = {
      id: 2,
      receiver: { ediAccountName: 'EDI_ACCT' },
    }
    expect(transformSupplier(raw).name).toBe('EDI_ACCT')
  })

  it('falls back to liveIsaId when organizationName and ediAccountName absent', () => {
    const raw: RawOrderfulRelationship = {
      id: 3,
      receiver: { liveIsaId: 'ISA-FALLBACK' },
    }
    expect(transformSupplier(raw).name).toBe('ISA-FALLBACK')
  })

  it('falls back to id string when all receiver fields absent', () => {
    const raw: RawOrderfulRelationship = { id: 4, receiver: {} }
    expect(transformSupplier(raw).name).toBe('4')
  })

  it('passes schema validation', () => {
    const raw: RawOrderfulRelationship = { id: 5, receiver: { organizationName: 'Test' } }
    expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
  })
})
