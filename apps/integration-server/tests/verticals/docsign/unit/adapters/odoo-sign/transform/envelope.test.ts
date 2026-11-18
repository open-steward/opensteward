/** sign.request rows; field names from github.com/odoo/industry 19.0 / master sign_request.xml. */
import { describe, expect, it } from 'vitest'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/odoo-sign/transform/envelope'

const base = {
  id: 5,
  display_name: 'DISPLAY RIGHTS AGREEMENT(2).pdf',
  subject: 'Signature Request - DISPLAY RIGHTS AGREEMENT(2).pdf',
  reference: 'DISPLAY RIGHTS AGREEMENT(2).pdf',
  state: 'signed',
  template_id: [6, 'Display Rights Agreement'] as [number, string],
  request_item_ids: [12, 11],
  validity: '2026-03-01',
  last_reminder: '2026-02-20 08:00:00',
  create_uid: [2, 'Mitchell Admin'] as [number, string],
  create_date: '2026-02-01 09:30:00',
  write_date: '2026-02-15 14:20:00',
}

describe('odoo-sign transformEnvelope', () => {
  it('maps a signed request', () => {
    const e = EnvelopeSchema.parse(transformEnvelope(base, ['5:61']))
    expect(e).toMatchObject({
      id: '5',
      externalId: '5',
      status: 'completed',
      subject: 'Signature Request - DISPLAY RIGHTS AGREEMENT(2).pdf',
      senderId: '2',
      senderName: 'Mitchell Admin',
      signingOrder: 'parallel',
      signerIds: ['11', '12'],
      documentIds: ['5:61'],
      templateId: '6',
      createdAt: '2026-02-01T09:30:00.000Z',
      updatedAt: '2026-02-15T14:20:00.000Z',
      expiresAt: '2026-03-01T00:00:00.000Z',
      platform: 'odoo-sign',
    })
    expect(e.metadata).toEqual({
      state: 'signed',
      reference: 'DISPLAY RIGHTS AGREEMENT(2).pdf',
      templateName: 'Display Rights Agreement',
      lastReminder: '2026-02-20T08:00:00.000Z',
    })
  })

  it.each([
    ['sent', 'sent'],
    ['signed', 'completed'],
    ['shared', 'unknown'],
    ['canceled', 'unknown'],
  ])('state %s is %s', (state, status) => {
    expect(EnvelopeSchema.parse(transformEnvelope({ ...base, state })).status).toBe(status)
  })

  it('falls back to reference, then display_name, for the subject', () => {
    expect(EnvelopeSchema.parse(transformEnvelope({ ...base, subject: false })).subject).toBe(
      'DISPLAY RIGHTS AGREEMENT(2).pdf',
    )
    expect(
      EnvelopeSchema.parse(transformEnvelope({ ...base, subject: false, reference: false }))
        .subject,
    ).toBe('DISPLAY RIGHTS AGREEMENT(2).pdf')
  })

  it('tolerates a row with only an id (fields the server lacks are absent)', () => {
    const e = EnvelopeSchema.parse(transformEnvelope({ id: 9 }))
    expect(e).toMatchObject({
      id: '9',
      status: 'unknown',
      subject: '',
      signerIds: [],
      documentIds: [],
    })
    expect(e.templateId).toBeUndefined()
    expect(e.senderId).toBeUndefined()
    expect(e.metadata).toEqual({})
  })

  it('reads empty fields as absent, not as values', () => {
    const e = EnvelopeSchema.parse(
      transformEnvelope({
        ...base,
        template_id: false,
        create_uid: false,
        validity: false,
        last_reminder: false,
        request_item_ids: false,
      }),
    )
    expect(e.templateId).toBeUndefined()
    expect(e.expiresAt).toBeUndefined()
    expect(e.signerIds).toEqual([])
    expect(e.metadata).not.toHaveProperty('lastReminder')
  })
})
