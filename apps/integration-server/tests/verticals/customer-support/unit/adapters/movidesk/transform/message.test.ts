/**
 * Fixture: the documented `ticket.actions[n]` example from
 * https://atendimento.movidesk.com/kb/article/256/movidesk-ticket-api
 * (type "1 = Interna 2 = Pública"; profileType "Agente = 1, Cliente = 2,
 * Agente e Cliente = 3"; createdDate "datetime UTC", sent without a zone).
 */
import { describe, it, expect } from 'vitest'
import {
  transformMessage,
  type RawMovideskAction,
} from '../../../../../../../src/verticals/customer-support/adapters/movidesk/transform/message'
import { MessageSchema } from '../../../../../../../src/verticals/customer-support/schema/message'

const raw: RawMovideskAction = {
  id: 1,
  type: 2,
  origin: 9,
  description: 'Descrição da ação',
  status: 'Status',
  justification: 'Justificativa',
  createdDate: '2016-11-21T14:25:07.1920886',
  createdBy: {
    id: 'CodRefDoGeradorDaAção',
    personType: 1,
    profileType: 1,
    businessName: 'Nome do gerador da ação',
    email: 'email@gerador.com',
    phone: '(47) 99999-9999',
  },
  isDeleted: false,
  attachments: [
    {
      fileName: 'minhaImagem.png',
      path: '7BDEA1B62A8641FF86982D0CF9F3DEC0',
      createdBy: { id: 'CodRefDeQuemEnviouOArquivo', personType: 1, profileType: 1 },
      createdDate: '2017-05-29T14:19:50.0129141',
    },
  ],
}

describe('movidesk transformMessage', () => {
  it('parses the documented example through MessageSchema', () => {
    const m = MessageSchema.parse(transformMessage(raw, '1'))
    expect(m).toMatchObject({
      id: '1:1',
      externalId: '1',
      ticketId: '1',
      authorId: 'CodRefDoGeradorDaAção',
      authorType: 'user',
      body: 'Descrição da ação',
      type: 'public',
      attachmentCount: 1,
      platform: 'movidesk',
    })
    expect(m.metadata).toEqual({
      actionType: '2',
      origin: '9',
      status: 'Status',
      justification: 'Justificativa',
    })
  })

  it('reads the zoneless documented createdDate as UTC, whatever the host zone', () => {
    // Containers run UTC, where a local-time parse looks correct: force a non-UTC zone.
    const prev = process.env.TZ
    process.env.TZ = 'America/Sao_Paulo'
    try {
      expect(new Date('2016-11-21T14:25:07').getTimezoneOffset()).not.toBe(0)
      expect(transformMessage(raw, '1').createdAt).toBe('2016-11-21T14:25:07.192Z')
      expect(transformMessage({ ...raw, createdDate: '2024-05-10T08:30:00Z' }, '1').createdAt).toBe(
        '2024-05-10T08:30:00.000Z',
      )
      expect(
        transformMessage({ ...raw, createdDate: '2024-05-10T08:30:00-03:00' }, '1').createdAt,
      ).toBe('2024-05-10T11:30:00.000Z')
    } finally {
      if (prev === undefined) delete process.env.TZ
      else process.env.TZ = prev
    }
  })

  it('maps type 1 (Interna) to internal and 2 (Pública) to public; anything else is unknown', () => {
    expect(transformMessage({ ...raw, type: 1 }, '1').type).toBe('internal')
    expect(transformMessage({ ...raw, type: 2 }, '1').type).toBe('public')
    const odd = transformMessage({ ...raw, type: 7 }, '1')
    expect(odd.type).toBe('unknown')
    expect(() => MessageSchema.parse(odd)).not.toThrow()
  })

  it('maps createdBy.profileType: 1 and 3 are users, 2 is a contact, others unknown', () => {
    const by = (profileType: number) =>
      transformMessage({ ...raw, createdBy: { ...raw.createdBy, profileType } }, '1').authorType
    expect(by(1)).toBe('user')
    expect(by(2)).toBe('contact')
    expect(by(3)).toBe('user')
    expect(by(9)).toBe('unknown')
  })

  it('an action with no createdBy has an unknown author and no author id', () => {
    const m = MessageSchema.parse(transformMessage({ ...raw, createdBy: null }, '1'))
    expect(m.authorType).toBe('unknown')
    expect(m.authorId).toBe('')
  })

  it('scopes the per-ticket action number to its ticket, so ids do not collide', () => {
    const a = transformMessage(raw, '10')
    const b = transformMessage(raw, '11')
    expect(a.id).toBe('10:1')
    expect(b.id).toBe('11:1')
    expect(a.externalId).toBe('1')
    expect(b.externalId).toBe('1')
  })

  it('throws rather than inventing an id or a date', () => {
    expect(() => transformMessage({ ...raw, id: null }, '1')).toThrow(/id/)
    expect(() => transformMessage({ ...raw, createdDate: null }, '1')).toThrow(/createdDate/)
  })
})
