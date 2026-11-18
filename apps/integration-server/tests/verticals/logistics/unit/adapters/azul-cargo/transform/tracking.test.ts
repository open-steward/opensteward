/**
 * The fixture follows the documented 200 body of POST /api/Rastreio/Consultar
 * (https://ediapi.onlineapp.com.br/toolkit/swagger/docs/v1): an array of arrays
 * of WEBCARGO_JSON_Rastreio_Ocorrencia, whose properties are Codigo, Comentario,
 * DataHora (date-time), Descricao, Unidade, UnidadeMunicipio, UnidadeUF, Usuario
 * and Volumes (int32). The spec gives types, not example values.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  transformTracking,
  type AzulCargoRastreio,
} from '../../../../../../../src/verticals/logistics/adapters/azul-cargo/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

const RASTREIO = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'rastreio-consultar.json'), 'utf8'),
) as AzulCargoRastreio

describe('transformTracking', () => {
  it('emits one event per occurrence across the nested arrays, in order', () => {
    const events = transformTracking('AWB123', RASTREIO)
    expect(events.map((e) => e.description)).toEqual(['AWB EMITIDO', 'EM TRANSITO', 'ENTREGUE'])
  })

  it('every event parses with TrackingEventSchema', () => {
    for (const e of transformTracking('AWB123', RASTREIO)) {
      expect(TrackingEventSchema.parse(e)).toEqual(e)
    }
  })

  it('takes trackingNumber from the AWB asked for (the response carries none)', () => {
    for (const e of transformTracking('AWB123', RASTREIO)) expect(e.trackingNumber).toBe('AWB123')
  })

  it('reads occurredAt from DataHora', () => {
    expect(transformTracking('AWB123', RASTREIO)[2].occurredAt).toEqual(
      new Date('2024-03-03T14:30:00Z'),
    )
  })

  it('reads the location from UnidadeMunicipio and UnidadeUF, with no country', () => {
    expect(transformTracking('AWB123', RASTREIO)[1].location).toEqual({
      city: 'RECIFE',
      state: 'PE',
    })
  })

  it('omits the location when neither unit field is present', () => {
    const [e] = transformTracking('AWB123', [[{ Codigo: '01', Descricao: 'X' }]])
    expect(e.location).toBeUndefined()
  })

  it('reports UNKNOWN status, because the spec documents no Codigo enumeration', () => {
    for (const e of transformTracking('AWB123', RASTREIO)) expect(e.status).toBe('UNKNOWN')
  })

  it('keeps the raw occurrence as metadata', () => {
    expect(transformTracking('AWB123', RASTREIO)[0].metadata).toBe(RASTREIO[0][0])
  })

  it('returns no events for an empty response, never a synthetic one', () => {
    expect(transformTracking('AWB123', [])).toEqual([])
    expect(transformTracking('AWB123', [[]])).toEqual([])
  })
})
