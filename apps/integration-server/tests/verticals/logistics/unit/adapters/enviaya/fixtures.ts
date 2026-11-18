/**
 * The documented example response of EnviaYa's "Get all services" request,
 * copied verbatim from the Postman collection behind docs.enviaya.com.mx:
 * https://docs.enviaya.com.mx/api/collections/97219/Szf8285x?environment=97219-931f3b56-b494-4228-903e-e0157d67264c&segregateAuth=true&versionTag=latest
 *
 *   Services > Get all services, saved example "Get all services" (200):
 *   GET https://enviaya.com.mx/api/v2/carrier_services/services_map?api_key=API_KEY
 *
 * Kept whole, including the UPS entry {"": null} and the repeated codes, so
 * the transform is tested against what the vendor actually shows.
 */
import type { EnviaYaServicesMapResponse } from '../../../../../../src/verticals/logistics/adapters/enviaya/transform/carrier'

export const SERVICES_MAP_EXAMPLE: EnviaYaServicesMapResponse = {
  services: {
    FedEx: [
      {
        INTERNATIONAL_PRIORITY: 'International Priority',
      },
      {
        FIRST_OVERNIGHT: 'Nacional 8:30 AM',
      },
      {
        international_economy_freight: 'International Economy Freight',
      },
      {
        PRIORITY_OVERNIGHT: 'Nacional 10:30 AM',
      },
      {
        fedex_express_saver: 'Nacional económico',
      },
      {
        INTERNATIONAL_ECONOMY: 'International Economy',
      },
      {
        FEDEX_1_DAY_FREIGHT: '1 Day Freight',
      },
      {
        international_priority: 'International Priority',
      },
      {
        first_overnight: 'Nacional 8:30 AM',
      },
      {
        international_first: 'International First',
      },
      {
        FEDEX_2_DAY_FREIGHT: '2 Day Freight',
      },
      {
        STANDARD_OVERNIGHT: 'Nacional día siguiente',
      },
      {
        INTERNATIONAL_PRIORITY_OVERNIGHT: 'INTERNATIONAL_PRIORITY_OVERNIGHT',
      },
      {
        international_priority_freight: 'International Priority Freight',
      },
      {
        fedex_2_day_freight: '2 Day Freight',
      },
      {
        FEDEX_EXPRESS_SAVER: 'Nacional económico',
      },
      {
        INTERNATIONAL_FIRST: 'International First',
      },
      {
        standard_overnight: 'Nacional día siguiente',
      },
      {
        international_economy: 'International Economy',
      },
      {
        fedex_1_day_freight: '1 Day Freight',
      },
      {
        FEDEX_2_DAY_FREIGHT: '2 Day Freight',
      },
      {
        FEDEX_1_DAY_FREIGHT: '1 Day Freight',
      },
      {
        priority_overnight: 'Nacional 10:30 AM',
      },
    ],
    UPS: [
      {
        '07': 'UPS Express',
      },
      {
        '65': 'UPS Express Saver',
      },
      {
        '54': 'UPS Worldwide Express Plus',
      },
      {
        '11': 'UPS Standard',
      },
      {
        EFIMPORT: 'EFIMPORT',
      },
      {
        '65': 'UPS Worldwide Express Saver',
      },
      {
        '': null,
      },
      {
        '2': 'UPS Worldwide Express Freight',
      },
      {
        '07': 'UPS Worldwide Express',
      },
      {
        '11': 'UPS Standard',
      },
      {
        '54': 'UPS Express Plus',
      },
      {
        '08': 'UPS Worldwide Expedited',
      },
      {
        EFEXPORT: 'EFEXPORT',
      },
    ],
    DHL: [
      {
        E: 'Express 9:00 NonDoc',
      },
      {
        I: 'Doméstico express 8:30',
      },
      {
        i: 'Doméstico express 8:30',
      },
      {
        c: 'Medical Express',
      },
      {
        '7': 'Domestic Express easy (Prepaid)',
      },
      {
        o: 'Doméstico express 10:30',
      },
      {
        m: 'Express 10:30 NonDoc',
      },
      {
        X: 'Express envelope',
      },
      {
        n: 'Doméstico express',
      },
      {
        T: 'Express 12:00 Doc',
      },
      {
        C: 'Medical Express',
      },
      {
        P: 'Express Worldwide NonDoc',
      },
      {
        t: 'Express 12:00 Doc',
      },
      {
        M: 'Express 10:30 NonDoc',
      },
      {
        SPRINTLINE: 'Sprintline',
      },
      {
        u: 'Doméstico envío salida RDD',
      },
      {
        D: 'Express Worldwide Doc',
      },
      {
        '6': 'Doméstico envío retorno',
      },
      {
        V: 'Express EDOMM',
      },
      {
        K: 'Express 9:00 Doc',
      },
      {
        '1': 'Doméstico express 12:00',
      },
      {
        G: 'Doméstico economy select',
      },
      {
        k: 'Express 9:00 Doc',
      },
      {
        N: 'Doméstico express',
      },
      {
        l: 'Express 10:30 Doc',
      },
      {
        O: 'Doméstico express 10:30',
      },
      {
        L: 'Express 10:30 Doc',
      },
      {
        '8': 'Express easy',
      },
      {
        p: 'Express Worldwide NonDoc',
      },
      {
        g: 'Doméstico economy select',
      },
      {
        U: 'Doméstico envío salida RDD',
      },
      {
        y: 'Express 12:00 NonDoc',
      },
      {
        x: 'Express envelope',
      },
    ],
    Paquetexpress: [
      {
        DS: 'Día siguiente',
      },
      {
        A12: 'Día siguiente 12:00',
      },
      {
        '2D': '2 días',
      },
      {
        ST: 'Económico',
      },
    ],
    Estafeta: [
      {
        lo: 'Carga',
      },
      {
        '50': 'Día siguiente 11:30',
      },
      {
        '60': 'Día siguiente',
      },
      {
        '30': 'Día siguiente 9:30',
      },
      {
        '70': 'Terrestre',
      },
      {
        D0: '2 días',
      },
    ],
    Redpack: [
      {
        '1': 'Express',
      },
      {
        '4': 'Metropolitano',
      },
      {
        '2': 'Ecoexpress',
      },
    ],
    Minutos: [
      {
        SAMEDAY_BICYCLE: 'SAMEDAY_BICYCLE',
      },
      {
        sameday_bike: 'sameday_bike',
      },
      {
        SAMEDAY_BIKE: 'SAMEDAY_BIKE',
      },
      {
        sameday_mini: 'sameday_mini',
      },
      {
        sameday_bicycle: 'sameday_bicycle',
      },
      {
        SAMEDAY_MINI: 'SAMEDAY_MINI',
      },
      {
        '1_xs': 'SameDay XS',
      },
      {
        '2_xs': 'NextDay XS',
      },
      {
        '3_xs': '99minutos XS',
      },
      {
        '4_xs': 'CO2 Free XS',
      },
      {
        '1_s': 'SameDay S',
      },
      {
        '2_s': 'NextDay S',
      },
      {
        '3_s': '99minutos S',
      },
      {
        '4_s': 'CO2 Free S',
      },
      {
        '1_m': 'SameDay M',
      },
      {
        '2_m': 'NextDay M',
      },
      {
        '3_m': '99minutos M',
      },
      {
        '4_m': 'CO2 Free M',
      },
      {
        '1_l': 'SameDay L',
      },
      {
        '2_l': 'NextDay L',
      },
      {
        '3_l': '99minutos L',
      },
      {
        '4_l': 'CO2 Free L',
      },
      {
        '1_xl': 'SameDay  XL',
      },
      {
        '2_xl': 'NextDay XL',
      },
      {
        '3_xl': '99minutos XL',
      },
      {
        '4_xl': 'CO2 Free XL',
      },
    ],
    iVoy: [
      {
        '5': 'Moto con Caja Mediana',
      },
      {
        '6': 'Moto con Caja Grande',
      },
      {
        '3': 'Moto sin Caja',
      },
    ],
  },
}
