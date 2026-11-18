import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawOctadeskTicket,
} from '../../../../../../../src/verticals/customer-support/adapters/octadesk/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('octadesk transformTicket', () => {
  const raw: RawOctadeskTicket = {
    number: 1042,
    summary: 'Produto com defeito',
    description: 'O produto chegou com avaria.',
    status: { id: 'st-1', name: 'Aberto' },
    priority: { id: 'pr-2', name: 'Alta' },
    channel: { id: 'ch-1', name: 'Email' },
    requester: { id: 'req-uuid', name: 'Cliente', email: 'cliente@example.com' },
    assigned: { id: 'agt-uuid', name: 'Agente', email: 'agente@co.example' },
    group: { id: 'grp-uuid', name: 'Suporte' },
    tags: ['defeito', 'logistica'],
    openDate: '2024-08-01T10:00:00.000Z',
    lastDateUpdate: '2024-08-02T15:00:00.000Z',
  }

  it('maps number as id, externalId, and number field', () => {
    const result = transformTicket(raw)
    expect(result.id).toBe('1042')
    expect(result.externalId).toBe('1042')
    expect(result.number).toBe('1042')
  })

  it('maps summary to subject', () => {
    const result = transformTicket(raw)
    expect(result.subject).toBe('Produto com defeito')
  })

  it('maps status "Aberto" to open', () => {
    const result = transformTicket(raw)
    expect(result.status).toBe('open')
  })

  it('maps status "Resolvido" to resolved', () => {
    const resolved: RawOctadeskTicket = { ...raw, status: { name: 'Resolvido' } }
    const result = transformTicket(resolved)
    expect(result.status).toBe('resolved')
  })

  it('maps status "Fechado" to closed', () => {
    const closed: RawOctadeskTicket = { ...raw, status: { name: 'Fechado' } }
    const result = transformTicket(closed)
    expect(result.status).toBe('closed')
  })

  it('maps priority "Alta" to high', () => {
    const result = transformTicket(raw)
    expect(result.priority).toBe('high')
  })

  it('maps channel "Email" to email', () => {
    const result = transformTicket(raw)
    expect(result.channel).toBe('email')
  })

  it('maps requester.id to requesterId', () => {
    const result = transformTicket(raw)
    expect(result.requesterId).toBe('req-uuid')
  })

  it('maps assigned.id to assigneeId', () => {
    const result = transformTicket(raw)
    expect(result.assigneeId).toBe('agt-uuid')
  })

  it('maps group.id to teamId', () => {
    const result = transformTicket(raw)
    expect(result.teamId).toBe('grp-uuid')
  })

  it('maps tags array to tagIds', () => {
    const result = transformTicket(raw)
    expect(result.tagIds).toEqual(['defeito', 'logistica'])
  })

  it('maps openDate to createdAt ISO string', () => {
    const result = transformTicket(raw)
    expect(result.createdAt).toBe('2024-08-01T10:00:00.000Z')
  })

  it('maps lastDateUpdate to updatedAt ISO string', () => {
    const result = transformTicket(raw)
    expect(result.updatedAt).toBe('2024-08-02T15:00:00.000Z')
  })

  it('sets resolvedAt when status is resolved', () => {
    const resolved: RawOctadeskTicket = {
      ...raw,
      status: { name: 'Resolvido' },
      lastDateUpdate: '2024-08-05T12:00:00.000Z',
    }
    const result = transformTicket(resolved)
    expect(result.resolvedAt).toBe('2024-08-05T12:00:00.000Z')
  })

  it('resolvedAt is undefined when open', () => {
    const result = transformTicket(raw)
    expect(result.resolvedAt).toBeUndefined()
  })

  it('sets platform to octadesk', () => {
    const result = transformTicket(raw)
    expect(result.platform).toBe('octadesk')
  })

  it('produces a TicketSchema-valid result', () => {
    const result = transformTicket(raw)
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })
})
