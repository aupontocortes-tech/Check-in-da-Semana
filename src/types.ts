export type StrengthSessionsOption = '0' | '1-2' | '3-4' | '5+';
export type CardioSessionsOption = '0' | '1-2' | '3-4' | '5+';
export type CardioDurationOption = '20' | '30' | '45+';
export type CardioIntensityOption = 'Leve' | 'Moderada' | 'Alta';
export type EnergyOption = 'Excelente' | 'Boa' | 'Média' | 'Baixa';
export type SleepOption = 'Muito bom' | 'Bom' | 'Regular' | 'Ruim';
export type FoodAdherenceOption = 'Sim, totalmente' | 'Sim, em parte' | 'Não muito';
export type MotivationOption = 'Muito alta' | 'Boa' | 'Média' | 'Preciso de impulso';

export interface CheckinFormData {
  nomeCompleto: string;
  semanaTexto: string; // "Semana de … até …"
  /** Lista de dias marcados no calendário no formato YYYY-MM-DD */
  diasMarcados?: string[];
  treinosForca: StrengthSessionsOption;
  evolucaoDesempenho: 'Sim, bastante' | 'Sim, um pouco' | 'Ainda não';
  treinoNaoCompletado?: string;
  dorOuFadiga?: string;
  cardioSessoes: CardioSessionsOption;
  tipoCardio?: string;
  duracaoCardio: CardioDurationOption;
  intensidadeCardio: CardioIntensityOption;
  energiaGeral: EnergyOption;
  sonoRecuperacao: SleepOption;
  alimentacaoPlano: FoodAdherenceOption;
  motivacaoHumor: MotivationOption;
  ajusteProximaSemana?: string;
  comentariosAdicionais?: string;
  whatsapp?: string;
  /** Data URL (base64) da foto de perfil da aluna */
  fotoPerfil?: string;
  createdAt?: string;
}