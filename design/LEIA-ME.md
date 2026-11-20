# BR ALERTA — Design e Assets 3D

Parte do **Enzo**: identidade visual, ícones e modelos 3D.

## O que tem aqui

| Arquivo | Para que serve | Quem usa |
| --- | --- | --- |
| `src/design/tokens.css` | Cores, fonte, cantos e sombras oficiais (viram classes Tailwind) | Léo |
| `src/design/assets.ts` | Liga cada categoria ao ícone, marcador e modelo 3D | Valentino e Léo |
| `public/brand/logo.svg` | Logo para fundo claro | Todos |
| `public/brand/logo-branco.svg` | Logo para fundo escuro (slides, login) | Gabriela e Léo |
| `public/brand/simbolo.svg` | Só o pino, para espaços pequenos | Todos |
| `public/brand/simbolo-branco.svg` | Pino branco, para usar sobre a cor coral ou fotos | Gabriela e Léo |
| `public/favicon.svg` | Ícone da aba do navegador | Já ligado no `index.html` |
| `public/icones/poste-apagado.svg` e `buraco.svg` | Ícones de traço 24x24 (herdam a cor do texto) | Léo |
| `public/icones/marcador-poste.svg` e `marcador-buraco.svg` | Pinos do mapa 48x60 | Valentino |
| `public/modelos/poste-apagado.glb` | Poste com a lâmpada apagada e um fio solto | Valentino |
| `public/modelos/poste-aceso.glb` | Mesmo poste aceso, para o status **Resolvido** | Valentino |
| `public/modelos/buraco.glb` | Buraco com asfalto quebrado, poça e cone de sinalização | Valentino |
| `design/gerar-*.mjs` | Scripts que criam os SVGs e os modelos (para refazer ou ajustar) | Enzo |

## Cores

| Token | Cor | Uso |
| --- | --- | --- |
| `navy` | `#142238` | Textos e botões escuros |
| `coral` | `#F04E45` | Marca, botão principal, categoria Buraco |
| `poste` | `#F4A340` | Categoria Poste apagado |
| `fundo` | `#EEF2F7` | Fundo da página |
| `superficie` | `#F5F7FA` | Inputs e áreas internas |
| `linha` | `#E2E8F0` | Bordas |
| `texto-suave` | `#6F7E93` | Texto secundário |
| `pendente` / `pendente-fundo` | `#B56708` / `#FFF4E6` | Status Pendente |
| `andamento` / `andamento-fundo` | `#2868BD` / `#EAF2FF` | Status Em andamento |
| `resolvido` / `resolvido-fundo` | `#187653` / `#E9F8F1` | Status Resolvido |

Fonte: **Manrope** (já carregada em `src/styles.css`).

### Exemplos de classes (Léo)

```tsx
<button className="bg-coral hover:bg-coral-escuro text-white font-bold rounded-botao px-5 py-3 shadow-flutuante">
  Registrar ocorrência
</button>

<div className="bg-white border border-linha rounded-card shadow-card p-4">...</div>

import { STATUS_CLASSES } from '../design/assets';
<span className={`rounded-full px-2 py-1 text-xs font-bold ${STATUS_CLASSES[incident.status]}`}>Pendente</span>
```

## Modelos 3D (Valentino)

- Formato **GLB**, materiais PBR simples, sem texturas (arquivos leves: 32 KB a 110 KB).
- **Unidade: metros. Eixo Y para cima. Origem (0,0,0) no chão, no centro da base.**
  É só colocar o modelo na coordenada da ocorrência, sem deslocar.
- Tamanho real: poste com 7,2 m de altura; buraco com cerca de 2 m de largura (3 m contando o cone).
  Em zoom de bairro o tamanho real fica pequeno. Se precisar, aumente a escala (ex.: 3x) só na hora de mostrar.
- As peças têm nomes (`Poste_Haste`, `Luminaria_Lente`, `Cone_Sinalizacao`...) para facilitar destacar a seleção.

Exemplo para escolher o modelo pela ocorrência:

```ts
import { modeloDaOcorrencia } from '../design/assets';
const { url } = modeloDaOcorrencia(incident.category, incident.status);
// GLTFLoader().load(url, (gltf) => cena.add(gltf.scene));
```

Exemplo para trocar o emoji do marcador pelo pino oficial:

```ts
import { CATEGORIAS } from '../design/assets';
node.innerHTML = `<img src="${CATEGORIAS[i.category].marcador}" alt="" width="40" height="50">`;
```

## Como refazer os arquivos

Na pasta do projeto:

```bash
npm i --no-save three@0.170.0 opentype.js@1.3.4 @fontsource/manrope@5.1.0
node design/gerar-modelos.mjs public/modelos
node design/gerar-svgs.mjs public
```

## Logo

O símbolo é um pino de contorno aberto com um ponto e uma onda: o ponto é o local exato do problema e a onda é o aviso saindo dali para a prefeitura. O estilo de traço arredondado veio de uma referência pesquisada no Dribbble; o desenho é próprio do projeto.

## Créditos

- Ícone do poste: baseado em `lightbulb-off` do [Lucide](https://lucide.dev) (licença ISC).
- Ícone do buraco: baseado em `traffic-cone` do Lucide (licença ISC).
- Fonte Manrope: licença SIL Open Font License.
- Modelos 3D: feitos do zero para o projeto.
