/**
 * Clicksign audit-trail transform.
 *
 * Fixture: the `events` block of `GET /api/v1/documents/:key`
 * (https://developers.clicksign.com/v1.0/docs/visualizar-documento.md, section
 * "Events: atributos dos eventos"), whose documented attributes are `name`,
 * `data` and `occurred_at`. The per-event `data` shapes are from the event
 * pages: `sign` (https://developers.clicksign.com/v1.0/docs/evento-sign.md),
 * `refusal`, `cancel`, `close`, `upload`, `deadline`.
 */
import { describe, it, expect } from 'vitest'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import {
  transformAuditTrailEntry,
  type RawClicksignEvent,
} from '../../../../../../../src/verticals/docsign/adapters/clicksign/transform/audit-trail-entry'

const DOC = 'f217e111-8a16-4842-af21-644d39d9bc6f'

/** Verbatim from the "Events" section example of visualizar-documento.md (all four events). */
const DOC_EVENTS: RawClicksignEvent[] = [
  { name: 'auto_close', data: null, occurred_at: '2018-06-22T02:32:45.375Z' },
  {
    name: 'sign',
    data: {
      signer: {
        name: 'Marcos Zumba',
        documentation: '123.321.123-40',
        birthday: '1983-03-31',
        address: '200.148.122.227',
        key: '935be7d1-b181-444f-8adc-bbff0b9ba48b',
        email: 'fulano@example.com',
        has_documentation: true,
        created_at: '2018-06-21T23:32:20.476-03:00',
        sign_as: 'sign',
        auths: ['email'],
        url: 'https://sandbox.clicksign.com/sign/935be7d1-b181-444f-8adc-bbff0b9ba48b',
      },
      account: { key: '35286aca-beef-490d-ad23-bc5e78441231' },
      log_version: '1.6.0',
      url: 'http://tavola.clicksign-staging.com',
    },
    occurred_at: '2018-06-22T02:32:45.156Z',
  },
  {
    name: 'add_signer',
    data: {
      user: { email: 'fulano@example.com', name: 'Michael Dois' },
      account: { key: '35286aca-beef-490d-ad23-bc5e78441231' },
      signers: [
        {
          key: '935be7d1-b181-444f-8adc-bbff0b9ba48b',
          email: 'fulano@example.com',
          name: 'Marcos Zumba',
          birthday: '1983-03-31',
          documentation: '123.321.123-40',
          has_documentation: true,
          created_at: '2018-06-21T23:32:20.476-03:00',
          sign_as: 'sign',
          auths: ['email'],
          url: 'https://sandbox.clicksign.com/sign/935be7d1-b181-444f-8adc-bbff0b9ba48b',
        },
      ],
    },
    occurred_at: '2018-06-22T02:32:20.551Z',
  },
  {
    name: 'upload',
    data: {
      user: { email: 'fulano@example.com', name: 'Michael Dois' },
      account: { key: '35286aca-beef-490d-ad23-bc5e78441231' },
      deadline_at: '2018-06-28T14:30:59.000-03:00',
      auto_close: true,
      locale: 'pt-BR',
    },
    occurred_at: '2018-06-22T02:32:20.512Z',
  },
]

describe('Clicksign transformAuditTrailEntry', () => {
  it('parses every documented example event with the canonical schema', () => {
    DOC_EVENTS.forEach((raw) => {
      const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(raw, DOC))
      expect(out.id).toBe(`${DOC}:${raw.occurred_at}:${raw.name}`)
      expect(out.externalId).toBe(out.id)
      expect(out.metadata).toEqual({ name: raw.name })
      expect(out.envelopeId).toBe(DOC)
      expect(out.platform).toBe('clicksign')
      expect(out.description).toBe(raw.name)
    })
  })

  it('reads occurred_at as the event time', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(DOC_EVENTS[0]!, DOC))
    expect(out.occurredAt).toBe('2018-06-22T02:32:45.375Z')
  })

  it('a system event (auto_close, data null) has no actor', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(DOC_EVENTS[0]!, DOC))
    expect(out.eventType).toBe('completed')
    expect(out.actorEmail).toBeUndefined()
    expect(out.actorName).toBeUndefined()
    expect(out.actorId).toBeUndefined()
  })

  it('a sign event takes its actor from data.signer, IP from signer.address', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(DOC_EVENTS[1]!, DOC))
    expect(out.eventType).toBe('signed')
    expect(out.actorId).toBe('935be7d1-b181-444f-8adc-bbff0b9ba48b')
    expect(out.actorEmail).toBe('fulano@example.com')
    expect(out.actorName).toBe('Marcos Zumba')
    expect(out.actorIp).toBe('200.148.122.227')
  })

  it('an operator event (upload / add_signer) takes its actor from data.user', () => {
    const upload = AuditTrailEntrySchema.parse(transformAuditTrailEntry(DOC_EVENTS[3]!, DOC))
    expect(upload.eventType).toBe('created')
    expect(upload.actorEmail).toBe('fulano@example.com')
    expect(upload.actorName).toBe('Michael Dois')
    expect(upload.actorIp).toBeUndefined()
    const add = AuditTrailEntrySchema.parse(transformAuditTrailEntry(DOC_EVENTS[2]!, DOC))
    expect(add.eventType).toBe('other')
    expect(add.actorName).toBe('Michael Dois')
  })

  it('maps the documented event names (eventos.md) to canonical types', () => {
    const cases: Array<[string, string]> = [
      ['upload', 'created'],
      ['sign', 'signed'],
      ['refusal', 'declined'],
      ['cancel', 'voided'],
      ['close', 'completed'],
      ['auto_close', 'completed'],
      ['deadline', 'expired'],
      ['add_signer', 'other'],
      ['remove_signer', 'other'],
      ['update_deadline', 'other'],
      ['update_auto_close', 'other'],
      ['custom', 'other'],
      ['add_image', 'other'],
      ['facematch_refused', 'other'],
      ['attempts_by_whatsapp_exceeded', 'other'],
    ]
    for (const [name, type] of cases) {
      const out = AuditTrailEntrySchema.parse(
        transformAuditTrailEntry(
          { name, data: null, occurred_at: '2023-03-27T14:11:21.973-03:00' },
          DOC,
        ),
      )
      expect(out.eventType, name).toBe(type)
    }
  })

  /**
   * The webhook pages (evento-refusal.md, evento-cancel.md, evento-close.md)
   * document each event's `data` but carry no `occurred_at`, since that is a
   * webhook body, not the document's `events` block. `data` below is verbatim
   * from each page; the `occurred_at` is supplied by the test.
   */
  const OCCURRED_AT = '2023-03-22T12:30:15.252Z'
  const REFUSAL_DATA = {
    signer: {
      key: '09739802-19bb-4352-9c96-1b3af7694f7d',
      email: 'email@empresa.com',
      name: 'Empresa de Teste',
      birthday: '1959-03-31',
      documentation: '000.007.000-91',
      has_documentation: true,
      created_at: '2023-03-22T09:30:15.252-03:00',
      auths: ['email'],
      selfie_enabled: false,
      handwritten_enabled: false,
      official_document_enabled: false,
      liveness_enabled: false,
      facial_biometrics_enabled: false,
      communicate_by: 'email',
      sign_as: ['administrator'],
    },
    refusal: {
      reasons: [
        'Conteúdo do documento',
        'Dados pessoais incorretos',
        'Forma de autenticação',
        'Uso de assinatura eletrônica',
        'Outros',
      ],
      comment: 'mais de 18 caracteres',
    },
    account: { key: '18ccd207-58b8-410f-a73e-585a4109a483' },
  }
  const USER_DATA = {
    user: { email: 'email@empresa.com', name: 'Empresa de Teste' },
    account: { key: '18ccd207-58b8-410f-a73e-585a4109a483' },
  }

  it('a refusal event (evento-refusal) takes its actor from data.signer', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry(
        { name: 'refusal', data: REFUSAL_DATA, occurred_at: OCCURRED_AT },
        DOC,
      ),
    )
    expect(out.eventType).toBe('declined')
    expect(out.actorEmail).toBe('email@empresa.com')
    expect(out.actorName).toBe('Empresa de Teste')
    expect(out.actorId).toBe('09739802-19bb-4352-9c96-1b3af7694f7d')
    expect(out.actorIp).toBeUndefined()
  })

  it('cancel (evento-cancel) and close (evento-close) take their actor from data.user', () => {
    for (const [name, type] of [
      ['cancel', 'voided'],
      ['close', 'completed'],
    ] as const) {
      const out = AuditTrailEntrySchema.parse(
        transformAuditTrailEntry({ name, data: USER_DATA, occurred_at: OCCURRED_AT }, DOC),
      )
      expect(out.eventType, name).toBe(type)
      expect(out.actorEmail, name).toBe('email@empresa.com')
      expect(out.actorName, name).toBe('Empresa de Teste')
    }
  })

  it('reads signer.address as the IP only on sign, the one event that documents it', () => {
    // evento-refusal.md documents no `address`; it is injected here only to
    // pin that a refusal never reports one.
    const withAddress = {
      ...REFUSAL_DATA,
      signer: { ...REFUSAL_DATA.signer, address: '200.148.122.227' },
    }
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry(
        { name: 'refusal', data: withAddress, occurred_at: OCCURRED_AT },
        DOC,
      ),
    )
    expect(out.actorIp).toBeUndefined()
  })
  it('throws, rather than inventing a time, when occurred_at is missing', () => {
    expect(() => transformAuditTrailEntry({ name: 'sign', data: null }, DOC)).toThrow(/occurred_at/)
  })

  it('throws when the documented name is missing', () => {
    expect(() =>
      transformAuditTrailEntry({ data: null, occurred_at: '2018-06-22T02:32:45.375Z' }, DOC),
    ).toThrow(/name/)
  })
})
