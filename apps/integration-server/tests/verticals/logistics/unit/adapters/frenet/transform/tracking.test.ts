/**
 * Fixtures: the documented TrackingResponse example
 * (https://frenetapi.docs.apiary.io/api-description-document, Group Tracking;
 * fields confirmed by https://docs.frenet.com.br/reference/trackorder) and the
 * tracking webhook body example
 * (https://docs.frenet.com.br/docs/webhook-atualização-de-tracking).
 */
import { describe, it, expect } from 'vitest'
import {
  transformTrackingResponse,
  type FrenetTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/frenet/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function documentedResponse(): FrenetTrackingResponse {
  return {
    ServiceDescrition: 'TESTE (OBJETO PARA TREINAMENTO)',
    TrackingUrl: 'https://rastreio.frenet.com.br/COR/TE123456785AA',
    TrackingEvents: [
      {
        EventDateTime: '10/02/2017 16:48',
        EventDescription: 'Objeto entregue ao destinatário',
        EventLocation: 'Boa Nova-BA',
        EventType: '9',
      },
      {
        EventDateTime: '09/02/2017 08:47',
        EventDescription:
          'Objeto aguardando retirada no endereço indicado - Para retirá-lo, é preciso informar o código do objeto. ',
        EventLocation: 'Boa Nova-BA',
        EventType: '1',
      },
      {
        EventDateTime: '25/08/2016 12:30',
        EventDescription: 'Saiu para entrega ao destinatário',
        EventLocation: 'BRASILIA-DF',
        EventType: '1',
      },
      {
        EventDateTime: '27/01/2017 15:20',
        EventDescription: 'Objeto postado',
        EventLocation: 'Diadema-SP',
        EventType: '0',
      },
    ],
    TrackingNumber: 'TE123456785AA',
  }
}

function webhookBody(eventType: string): FrenetTrackingResponse {
  return {
    OrderId: 'PLAT-ORDER-ID',
    ShipmentId: 21255,
    TrackingUrl: 'https://rastreio-h01.frenet.dev/COR/TE123456785AA',
    TrackingNumber: 'TE123456785AA',
    ServiceDescrition: 'TESTE (OBJETO PARA TREINAMENTO)',
    TrackingEvents: [
      {
        EventDateTime: '10/02/2017 16:48',
        EventDescription: 'Objeto entregue ao destinatário',
        EventLocation: 'Boa Nova-BA',
        EventType: eventType,
      },
    ],
  }
}

describe('frenet transformTrackingResponse', () => {
  it('returns one schema-valid event per documented TrackingEvents entry', () => {
    const events = transformTrackingResponse(documentedResponse())
    expect(events).toHaveLength(4)
    for (const e of events) expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    expect(events.map((e) => e.status)).toEqual([
      'DELIVERED',
      'IN_TRANSIT',
      'IN_TRANSIT',
      'PRE_TRANSIT',
    ])
  })

  it('maps TrackingNumber and EventDescription', () => {
    const [first] = transformTrackingResponse(documentedResponse())
    expect(first!.trackingNumber).toBe('TE123456785AA')
    expect(first!.description).toBe('Objeto entregue ao destinatário')
  })

  it('splits a "City-UF" location without assuming a country', () => {
    const events = transformTrackingResponse(documentedResponse())
    expect(events[0]!.location).toEqual({ city: 'Boa Nova', state: 'BA' })
    expect(events[2]!.location).toEqual({ city: 'BRASILIA', state: 'DF' })
  })

  it('leaves a location of any other shape to metadata', () => {
    const raw = documentedResponse()
    raw.TrackingEvents = [{ ...raw.TrackingEvents![0]!, EventLocation: 'Centro de distribuição' }]
    const [e] = transformTrackingResponse(raw)
    expect(e!.location).toBeUndefined()
    expect(e!.metadata?.['EventLocation']).toBe('Centro de distribuição')
  })

  it('does not build occurredAt from a wall-clock time with no documented zone', () => {
    const [e] = transformTrackingResponse(documentedResponse())
    expect(e!.occurredAt).toBeUndefined()
    expect(e!.metadata?.['EventDateTime']).toBe('10/02/2017 16:48')
  })

  it('maps every EventType of the webhook table', () => {
    const cases: Array<[string, string]> = [
      // "Cliente entregou ao ponto de postagem e está aguardando coleta"
      ['18', 'PRE_TRANSIT'],
      ['0', 'PRE_TRANSIT'],
      ['1', 'IN_TRANSIT'],
      ['2', 'IN_TRANSIT'],
      ['3', 'RETURN_TO_SENDER'],
      ['4', 'FAILURE'],
      ['5', 'OUT_FOR_DELIVERY'],
      ['9', 'DELIVERED'],
      ['77', 'UNKNOWN'],
      ['', 'UNKNOWN'],
    ]
    for (const [code, status] of cases) {
      expect(transformTrackingResponse(webhookBody(code))[0]!.status).toBe(status)
    }
  })

  it('leaves a lowercase or over-long state suffix to metadata', () => {
    for (const loc of ['Recife-pe', 'Curitiba-Parana', 'Natal-RNX']) {
      const [e] = transformTrackingResponse({
        TrackingEvents: [{ EventType: '1', EventLocation: loc }],
      })
      expect(e!.location).toBeUndefined()
      expect(e!.metadata?.['EventLocation']).toBe(loc)
    }
  })

  it('carries the webhook ShipmentId as a string', () => {
    const [e] = transformTrackingResponse(webhookBody('9'))
    expect(TrackingEventSchema.parse(e).shipmentId).toBe('21255')
  })

  it('returns no events, not a synthetic one, when TrackingEvents is empty or missing', () => {
    expect(transformTrackingResponse({ ...documentedResponse(), TrackingEvents: [] })).toEqual([])
    expect(transformTrackingResponse({ ...documentedResponse(), TrackingEvents: null })).toEqual([])
  })
})
