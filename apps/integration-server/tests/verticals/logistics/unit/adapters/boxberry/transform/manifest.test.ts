import { describe, it, expect } from 'vitest'
import {
  transformManifest,
  transformManifestFromCreate,
  type BoxberryParselSendResponse,
  type BoxberryParselSendStoryItem,
} from '../../../../../../../src/verticals/logistics/adapters/boxberry/transform/manifest'
import { ManifestSchema } from '../../../../../../../src/verticals/logistics/schema/manifest'

describe('transformManifestFromCreate (boxberry)', () => {
  it('maps id from response id', () => {
    const raw: BoxberryParselSendResponse = {
      id: '12345',
      label: 'https://api.boxberry.ru/act/12345.pdf',
    }
    expect(transformManifestFromCreate(raw).id).toBe('12345')
  })

  it('sets carrierId to boxberry', () => {
    const raw: BoxberryParselSendResponse = { id: '12345' }
    expect(transformManifestFromCreate(raw).carrierId).toBe('boxberry')
  })

  it('sets status to SUBMITTED', () => {
    const raw: BoxberryParselSendResponse = { id: '12345' }
    expect(transformManifestFromCreate(raw).status).toBe('SUBMITTED')
  })

  it('maps shipmentIds from caller-supplied array', () => {
    const raw: BoxberryParselSendResponse = { id: '12345' }
    const result = transformManifestFromCreate(raw, ['BBX001', 'BBX002'])
    expect(result.shipmentIds).toEqual(['BBX001', 'BBX002'])
    expect(result.labelCount).toBe(2)
  })

  it('sets submittedAt as a Date', () => {
    const result = transformManifestFromCreate({ id: '12345' })
    expect(result.submittedAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw: BoxberryParselSendResponse = { id: '12345' }
    expect(transformManifestFromCreate(raw).metadata).toBe(raw)
  })

  it('produces output that parses against ManifestSchema', () => {
    const raw: BoxberryParselSendResponse = { id: '12345' }
    expect(() => ManifestSchema.parse(transformManifestFromCreate(raw, ['BBX001']))).not.toThrow()
  })
})

describe('transformManifest (boxberry)', () => {
  it('sets carrierId to boxberry', () => {
    const raw: BoxberryParselSendStoryItem = { track: 'BBX001,BBX002', date: '2024.03.01 12:00:00' }
    expect(transformManifest(raw).carrierId).toBe('boxberry')
  })

  it('sets status to SUBMITTED', () => {
    const raw: BoxberryParselSendStoryItem = { track: 'BBX001', date: '2024.03.01 12:00:00' }
    expect(transformManifest(raw).status).toBe('SUBMITTED')
  })

  it('parses comma-separated track into shipmentIds', () => {
    const raw: BoxberryParselSendStoryItem = {
      track: 'BBX001,BBX002,BBX003',
      date: '2024.03.01 12:00:00',
    }
    const result = transformManifest(raw)
    expect(result.shipmentIds).toEqual(['BBX001', 'BBX002', 'BBX003'])
    expect(result.labelCount).toBe(3)
  })

  it('normalizes "YYYY.MM.DD HH:MM:SS" date to a Date', () => {
    const raw: BoxberryParselSendStoryItem = { track: 'BBX001', date: '2024.03.01 12:00:00' }
    expect(transformManifest(raw).submittedAt).toBeInstanceOf(Date)
  })

  it('handles null track gracefully', () => {
    const raw: BoxberryParselSendStoryItem = { track: null, date: '2024.03.01 12:00:00' }
    expect(transformManifest(raw).shipmentIds).toBeUndefined()
  })

  it('produces output that parses against ManifestSchema', () => {
    const raw: BoxberryParselSendStoryItem = { track: 'BBX001', date: '2024.03.01 12:00:00' }
    expect(() => ManifestSchema.parse(transformManifest(raw))).not.toThrow()
  })
})
