// BR ALERTA — Mapa dos recursos visuais por categoria e status.
// Responsável: Enzo (Design e Assets 3D)
//
// Use este arquivo em vez de escrever caminhos e cores "na mão" nos componentes.
// Ex.: CATEGORIAS[incident.category].marcador  ->  '/icones/marcador-poste.svg'
import type { IncidentCategory, IncidentStatus } from '../types';

const base = import.meta.env.BASE_URL;
const arquivo = (caminho: string) => `${base}${caminho}`;

export const MARCA = {
  logo: arquivo('brand/logo.svg'),
  logoBranco: arquivo('brand/logo-branco.svg'),
  simbolo: arquivo('brand/simbolo.svg'),
  simboloBranco: arquivo('brand/simbolo-branco.svg'),
} as const;

export interface ModeloVisual {
  /** Caminho do arquivo .glb */
  url: string;
  /** Tamanho real aproximado em metros (eixo Y para cima, origem no chão) */
  alturaMetros: number;
  larguraMetros: number;
}

export interface CategoriaVisual {
  nome: string;
  /** Cor da categoria (mesma do token Tailwind bg-poste / bg-buraco) */
  cor: string;
  /** Ícone de traço 24x24 para botões e listas */
  icone: string;
  /** Pino para o mapa 48x60, âncora na ponta de baixo */
  marcador: string;
  /** Modelo 3D do problema */
  modelo: ModeloVisual;
  /** Modelo 3D para quando o status for Resolvido (se existir) */
  modeloResolvido?: ModeloVisual;
}

type CategoriaComAssetOficial = Extract<IncidentCategory, 'STREETLIGHT' | 'POTHOLE'>;

export const CATEGORIAS: Record<CategoriaComAssetOficial, CategoriaVisual> = {
  STREETLIGHT: {
    nome: 'Poste apagado',
    cor: '#f4a340',
    icone: arquivo('icones/poste-apagado.svg'),
    marcador: arquivo('icones/marcador-poste.svg'),
    modelo: { url: arquivo('modelos/poste-apagado.glb'), alturaMetros: 7.2, larguraMetros: 2.2 },
    modeloResolvido: { url: arquivo('modelos/poste-aceso.glb'), alturaMetros: 7.2, larguraMetros: 2.2 },
  },
  POTHOLE: {
    nome: 'Buraco na rua',
    cor: '#f04e45',
    icone: arquivo('icones/buraco.svg'),
    marcador: arquivo('icones/marcador-buraco.svg'),
    modelo: { url: arquivo('modelos/buraco.glb'), alturaMetros: 0.7, larguraMetros: 3 },
  },
};

export function visualDaCategoria(categoria: IncidentCategory): CategoriaVisual | undefined {
  if (categoria === 'STREETLIGHT' || categoria === 'POTHOLE') {
    return CATEGORIAS[categoria];
  }
  return undefined;
}

/** Classes Tailwind do selo de status (usa os tokens de src/design/tokens.css) */
export const STATUS_CLASSES: Record<IncidentStatus, string> = {
  PENDING: 'bg-pendente-fundo text-pendente',
  IN_PROGRESS: 'bg-andamento-fundo text-andamento',
  RESOLVED: 'bg-resolvido-fundo text-resolvido',
  CANCELLED: 'bg-cancelado-fundo text-cancelado',
};

/** Escolhe o modelo certo: poste aceso quando o problema foi resolvido */
export function modeloDaOcorrencia(
  categoria: IncidentCategory,
  status: IncidentStatus,
): ModeloVisual | undefined {
  const c = visualDaCategoria(categoria);
  if (!c) return undefined;
  return status === 'RESOLVED' && c.modeloResolvido ? c.modeloResolvido : c.modelo;
}
