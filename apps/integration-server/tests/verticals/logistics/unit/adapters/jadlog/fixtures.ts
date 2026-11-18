/**
 * The "Estrutura do JSON retornado" example of Jadlog's "Consulta Pickup Points
 * Diário" (Documento de Integração v2.3, p. 28), abridged only in pudoHorario.
 * https://www.jadlog.com.br/jadlog/arquivos/api_integracao.pdf
 */
import type { JadlogPudo } from '../../../../../../src/verticals/logistics/adapters/jadlog/transform/warehouse'

export function documentedPudo(overrides: Partial<JadlogPudo> = {}): JadlogPudo {
  return {
    acessoDeficienteFisico: 0,
    ativo: 'S',
    cnpjCpf: '19517037000110',
    dt: '2018-05-30T08:24:56-03:00',
    estacionamento: 4,
    idioma: 'PT',
    infCompl: '101|CARRIER DEPOT',
    maxEncomendaDia: 35,
    pudoEnderecoList: [
      {
        bairro: 'CENTRO',
        cep: '93265160',
        cidade: 'ESTEIO',
        compl2: 'CENTRO',
        endereco: 'RUA 24 DE AGOSTO',
        idioma: 'PT',
        latitude: -29.851119,
        longitude: -51.169948,
        numero: '755',
        pais: 'BRA',
        uf: 'RS',
      },
    ],
    pudoHorario: { segH1OpenTm: '0800', segH4CloseTm: '1930' },
    pudoId: 'BR10598',
    pudoTipo: 200,
    razao: 'CO JADLOG - ESTEIO 01',
    responsavel: 'RAFAELA SCHNEIDER',
    ...overrides,
  }
}
