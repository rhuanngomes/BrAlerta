# BR ALERTA

**Plataforma colaborativa de inteligência urbana.** O cidadão registra problemas da cidade diretamente no mapa, todos acompanham o andamento e o gestor público atualiza o status de cada ocorrência.

> Projeto acadêmico do Enterprise Challenge, curso de Sistemas de Informação da FIAP. Os dados exibidos são fictícios. A aplicação não tem vínculo oficial com órgãos públicos e não substitui os canais da prefeitura, como a Central 1746 do Rio de Janeiro.

- Mapa vetorial MapLibre com OpenFreeMap, extrusão 3D de edifícios e câmera inicial no Recreio dos Bandeirantes, sem chave privada.
- Alternância 2D/3D, zoom, rotação, inclinação e retorno à área inicial do Recreio dos Bandeirantes.
- Objetos de ocorrências em Three.js, raycast para abrir detalhes, prévia ao posicionar e modelos GLB opcionais com malhas procedurais de fallback.
- Paleta de inserção acessível por teclado para postes apagados, buracos, alagamentos e ocorrências de segurança.
- 10 ocorrências fictícias georreferenciadas, filtros e detalhes com histórico.
- Cadastro completo por clique no mapa, validação, foto local opcional e persistência em `localStorage`.
- Página “Minhas ocorrências” e painel administrativo com atualização persistente de status.
- Central de notificações com novos registros, edições e mudanças de status; mensagens abrem a ocorrência no mapa e podem ser marcadas como lidas.
- Em “Minhas ocorrências”, o cidadão pode editar categoria, título e descrição ou cancelar um registro pendente; localização e foto permanecem inalteradas.
- Notificações lidas são salvas por usuário (localmente no modo demonstrativo e no Supabase no modo conectado).
- Layout responsivo, foco acessível e mensagens de loading, erro, vazio e sucesso contextual.
- Contrato `IncidentRepository`, implementações mock/Supabase e migração preparada para o banco remoto.

## Sumário

- [O problema](#o-problema)
- [A solução](#a-solução)
- [Funcionalidades do MVP](#funcionalidades-do-mvp)
- [Tecnologias](#tecnologias)
- [Como executar](#como-executar)
- [Modos de execução](#modos-de-execução)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Banco de dados](#banco-de-dados)
- [Testes e qualidade](#testes-e-qualidade)
- [Roteiro de demonstração](#roteiro-de-demonstração)
- [Limitações e próximos passos](#limitações-e-próximos-passos)
- [Equipe](#equipe)

---

## O problema

Postes apagados, buracos e alagamentos fazem parte do dia a dia das cidades brasileiras. As reclamações existem, mas ficam espalhadas entre telefone, aplicativos de prefeitura, redes sociais e grupos de mensagem. Nas redes, elas se perdem no meio de conteúdos de entretenimento. O resultado é que:

- o cidadão não sabe se o problema já foi relatado nem se alguém está cuidando dele;
- o gestor público não enxerga onde os problemas se repetem nem o que priorizar.

## A solução

O BR ALERTA reúne os relatos em um **mapa único, público e georreferenciado**:

1. O cidadão escolhe a categoria, clica no ponto exato do problema no mapa e descreve o que aconteceu.
2. A ocorrência aparece para todos os usuários, com status e histórico.
3. O gestor público acompanha as ocorrências em um painel administrativo e atualiza o status: **Pendente → Em andamento → Resolvido**.

O protótipo cobre uma região do **Recreio dos Bandeirantes, no Rio de Janeiro**, e duas categorias: **poste apagado** e **buraco na rua**.

## Funcionalidades do MVP

| Funcionalidade | Situação |
| --- | --- |
| Mapa navegável com visão inclinada (3D) e alternância para 2D | Pronto |
| Zoom, rotação, inclinação e botão para voltar à área inicial | Pronto |
| Registro de ocorrência por clique no mapa, com categoria, título, descrição e foto opcional | Pronto |
| Validação do formulário (local, título, descrição, tipo e tamanho da foto) | Pronto |
| Detalhes da ocorrência com histórico de status | Pronto |
| Página "Minhas ocorrências" com filtros por categoria e status | Pronto |
| Painel administrativo com busca, indicadores e atualização de status | Pronto (ver [bugs conhecidos](#bugs-conhecidos)) |
| Login, cadastro e papéis Cidadão/Administrador com Supabase Auth | Pronto (modo Supabase) |
| Atualização em tempo real com Supabase Realtime | Pronto (modo Supabase) |
| Modelos 3D (GLB) e prédios em 3D | Próxima versão |
| Busca por endereço | Simulada |

## Tecnologias

| Categoria | Tecnologias |
| --- | --- |
| Front-end | React, TypeScript, Vite, React Router, CSS próprio, Lucide (ícones) |
| Mapa | MapLibre GL JS com tiles do OpenStreetMap (sem chave privada) |
| Back-end e banco | Supabase (PostgreSQL, Auth, Storage, Realtime, funções RPC e políticas RLS) |
| Testes | Vitest, Testing Library, testes de banco com `supabase test db` |
| Qualidade e CI | ESLint, GitHub Actions (lint, testes, build e testes de RLS) |
| Gestão | Git e GitHub (uma branch por integrante), Kanban |

## Como executar

Requer **Node.js 20 ou superior**.

```bash
git clone https://github.com/rhuanngomes/BrAlerta.git
cd BrAlerta
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (normalmente `http://localhost:5173`).

Outros comandos:

```bash
npm run build      # gera a versão de produção
npm run preview    # abre a versão de produção localmente
npm run lint       # verifica o padrão do código
npm test           # roda os testes automatizados
npm run test:db    # roda os testes de banco e RLS (requer Supabase local)
```

## Estrutura do frontend

- Vite com React e TypeScript; a configuração de compilação também verifica os tipos.
- Tailwind CSS v4 integrado pelo plugin do Vite. As utilities podem ser usadas incrementalmente nos componentes.
- Os estilos existentes em `src/styles.css` foram mantidos; o reset global do Tailwind não é carregado para evitar mudanças visuais involuntárias.
- As rotas ficam em `src/App.tsx`, com `react-router-dom`; `src/components/layout` compartilha o layout e `src/pages` contém as telas.

## Arquitetura

- `src/components`: layout, mapa, formulários, detalhes e indicadores reutilizáveis.
- `src/pages`: mapa, ocorrências do cidadão, administração e página institucional.
- `src/repositories`: contrato de dados e implementação local.
- `src/context`: estado compartilhado e operações assíncronas.
- `src/data`: seed inicial gravado apenas quando não há dados no navegador.
- `supabase/migrations`: tabelas, validações, índices e RLS sem políticas públicas permissivas.

Sem `VITE_USE_SUPABASE=true`, login e cadastro funcionam em modo demonstrativo local: o login aceita um e-mail válido e qualquer senha não vazia, não salva a senha e permite cadastrar perfis de cidadão ou órgão público. Os dados do perfil público ficam no navegador e são recuperados ao entrar novamente com o mesmo e-mail. Cada e-mail identifica seu próprio estado demonstrativo, que não autentica no servidor. A opção “Entrar com outro usuário” no menu do perfil permite voltar ao login. No Supabase, RPCs protegidas permitem editar ou cancelar somente ocorrências pendentes do próprio cidadão; ambas preservam o histórico. As leituras das notificações também são vinculadas ao usuário.

### Conectar a um projeto Supabase

1. Aplique os arquivos de `supabase/migrations` em ordem crescente no SQL Editor do projeto.
2. Copie `.env.example` para `.env.local` e informe a URL do projeto e a publishable key:

   ```env
   VITE_USE_SUPABASE=true
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
   VITE_ENABLE_REALTIME=true
   ```

3. Habilite autenticação por e-mail/senha e reinicie o servidor Vite.
4. Para atualizações em tempo real, habilite `incidents`, `incident_history` e `notification_reads` na publicação `supabase_realtime`.

`.env.local` está no `.gitignore`. Não use nem compartilhe uma `service_role` key no frontend. Os testes automatizados simulam as respostas do Supabase; validar o projeto remoto exige credenciais configuradas localmente.

Para voltar aos dados iniciais, apague a chave `br-alerta-incidents-v1` no armazenamento local do navegador (DevTools → Application → Local Storage).

### 2. Modo Supabase

1. Crie um projeto no [Supabase](https://supabase.com).
2. Aplique as migrações da pasta `supabase/migrations`, em ordem.
3. Copie `.env.example` para `.env` e preencha:

```env
VITE_USE_SUPABASE=true
VITE_ENABLE_REALTIME=true
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica
```

4. Rode `npm run dev`, crie uma conta e confirme o e-mail.
5. Para ter dados de demonstração, rode `supabase/seed.sql` no SQL Editor (12 ocorrências fictícias com histórico).
6. Para tornar um usuário administrador, rode no SQL Editor:

```sql
update public.profiles
set role = 'ADMIN', updated_at = now()
where email = 'email-do-administrador@exemplo.com';
```

Novas contas escolhem `CITIZEN` ou `PUBLIC_AGENT`; o segundo exige órgão, esfera e cargo. A identidade institucional é autodeclarada neste fluxo, sem verificação de vínculo institucional. A promoção para `ADMIN` nunca é feita pela interface, e as políticas RLS garantem a autorização mesmo que alguém tente usar a API diretamente.

## Estrutura do projeto

```
src/
├── components/     # layout, mapa, formulário, detalhes, indicadores e rotas protegidas
├── context/        # estado de autenticação e de ocorrências
├── data/           # ocorrências fictícias do modo demonstração
├── lib/            # cliente Supabase, tipos do banco e tratamento de erros
├── pages/          # mapa, minhas ocorrências, painel admin, sobre, login e cadastro
├── repositories/   # contrato IncidentRepository + versões mock e Supabase
├── services/       # escolhe o repositório conforme o modo de execução
└── types/          # tipos de ocorrência, categoria, status e histórico
supabase/
├── migrations/     # tabelas, índices, perfis, RLS, storage e funções RPC
├── tests/          # testes das políticas de segurança
└── seed.sql        # ocorrências fictícias para o modo Supabase
tests/              # testes automatizados do front-end e dos repositórios
```

## Banco de dados

| Tabela | Conteúdo |
| --- | --- |
| `incidents` | Ocorrência: categoria, título, descrição, latitude, longitude, endereço, status, foto e datas |
| `scene_objects` | Objeto que representa a ocorrência no mapa: tipo, posição, altitude, rotação e escala |
| `incident_history` | Cada mudança de status, com quem mudou e quando |
| `profiles` | Nome, e-mail e papel do usuário (`CITIZEN`, `PUBLIC_AGENT` ou `ADMIN`), órgão, esfera e cargo |

Regras principais:

- qualquer usuário logado vê as ocorrências;
- o cidadão só cria ocorrências em seu próprio nome;
- agentes públicos e administradores mudam o status, sempre pela função `update_incident_status`, que grava o histórico na mesma transação.

## Testes e qualidade

**Testes automatizados** (`npm test`): formulário de ocorrência, repositório mock, repositório Supabase, conversão de dados e tratamento de erros de integração. A cada push ou pull request na `main`, o GitHub Actions roda lint, testes, build e os testes de RLS do banco.

**Testes manuais**: o plano de testes, com 20 casos (CT01 a CT20) e os resultados, está na documentação de qualidade do projeto. Para relatar um erro, abra uma issue com o modelo **Relatar bug**.

### Bugs conhecidos

Encontrados na revisão de qualidade e registrados para correção:

| ID | Gravidade | Descrição |
| --- | --- | --- |
| BUG-01 | Resolvido | Cadastro público permite atendimento no mapa também no modo demonstrativo; `/admin` continua exclusivo de administradores. |
| BUG-02 | Média | No modo demonstração, o botão Sair gera erro, porque tenta usar o Supabase, que não está configurado. |
| BUG-03 | Média | O marcador de prévia continua no mapa depois de publicar ou cancelar uma ocorrência. |
| BUG-04 | Média | A prévia no mapa sempre mostra o ícone de poste, mesmo quando a categoria escolhida é buraco. |
| BUG-05 | Baixa | A coluna Localização do painel e o endereço do formulário são fixos ("Recreio, RJ"). |
| BUG-06 | Baixa | Ao alternar entre Mapa 2D e 3D, a câmera volta para a última ocorrência aberta. |
| BUG-07 | Resolvido | Busca real conectada ao mapa e notificações com histórico e controle de leitura. |
| BUG-08 | Baixa | A página Sobre cita "Global Solution", mas o projeto é do Enterprise Challenge. |

## Roteiro de demonstração

1. Abrir o mapa e mostrar as ocorrências fictícias, alternando entre 3D e 2D.
2. Clicar em uma ocorrência e mostrar os detalhes e o histórico.
3. Clicar em **Registrar ocorrência**, escolher a categoria, clicar na rua e publicar.
4. Abrir **Minhas ocorrências** e filtrar por status.
5. Cadastrar uma conta de **Órgão público**, informar esfera, órgão e cargo; abrir a ocorrência no mapa e mudar o status para **Em andamento**.
6. Voltar ao mapa e mostrar o novo status no histórico.

> O atendimento funciona no modo demonstrativo e no Supabase após aplicar a migração de contas públicas. O modo demonstrativo salva alterações apenas neste navegador.

## Cidade viva em 3D

A vista **Cidade 3D** usa MapLibre com dados vetoriais OpenFreeMap / OpenStreetMap e uma cena Three.js em metros. Ruas, curvas e posições dos relatos são geográficas; prédios e mobiliário são uma representação artística, não uma reprodução cadastral. Os modelos locais KayKit City Builder Bits são CC0; a licença acompanha `public/models/city/LICENSE.txt`.

A cena inclui fachadas, calçadas, faixas, semáforos, iluminação, árvores e circulação de carros e pedestres. A decoração é reconstruída ao navegar, em uma área limitada ao redor da câmera, com instâncias compartilhadas para reduzir o custo gráfico. Não são inventadas ruas para formar uma grade.

- **Rua alagada:** lâmina de água, ondas, carro parcialmente submerso e bloqueios.
- **Trânsito intenso:** oito carros adicionais; o tráfego próximo desacelera.
- **Segurança:** dois personagens de ladrões animados.
- **Buraco:** cratera, cones e barreira.
- **Poste apagado:** poste com sinalização.

Escolha uma categoria na barra inferior, clique no mapa e preencha o relato. Pontos a até 22 metros de uma via são encaixados nela; o local final aparece no formulário. O clique fixa a prévia e outro clique reposiciona. A publicação salva a ocorrência pelo repositório existente. Ocorrências resolvidas ou canceladas deixam de produzir efeitos na cidade. Os botões permitem pausar a simulação, girar a câmera, aproximar e voltar à área inicial. A preferência de movimento reduzido inicia a simulação pausada.

Para usar **TRAFFIC** com Supabase, aplique a migração `supabase/migrations/202611190001_traffic_category.sql` ao banco. Ela amplia as restrições e as duas funções transacionais, preservando autenticação, propriedade e histórico. No modo demonstrativo, a categoria funciona no armazenamento local.

## Limitações e próximos passos

O mapa real precisa de conexão com OpenFreeMap. Os modelos são servidos pelo próprio aplicativo. A vista detalhada aparece a partir do zoom 15,5; ao afastar a câmera, permanece a visão cartográfica. A simulação de trânsito é visual e local, não uma previsão de mobilidade nem uma fonte de dados em tempo real. A busca por endereço consulta o Photon e move a câmera para o resultado escolhido. Fotos pequenas são guardadas como data URL no modo local e não são enviadas a servidor.


### Navegação e atendimento público

- Categorias na barra lateral filtram as ocorrências e os efeitos 3D. Clique novamente na categoria ou em **Todas as categorias** para limpar. O filtro de status permite consultar resolvidas e canceladas.
- O HUD identifica a rua mais próxima do centro com os nomes dos dados vetoriais, sem chamadas de geocodificação a cada movimento. Onde não houver rua nomeada em até 180 metros, mostra coordenadas e uma mensagem de orientação.
- Digite um endereço e pressione Enter ou a lupa. Escolha um resultado para mover a câmera; um resultado único é aberto automaticamente. Há cache de até 40 consultas, cancelamento de busca anterior, limite de 12 segundos e mensagens de indisponibilidade/nenhum resultado.
- O provedor padrão é o [Photon](https://github.com/komoot/photon), com dados OpenStreetMap. O servidor público é destinado a uso moderado, sem garantia de disponibilidade. `VITE_GEOCODING_URL` permite configurar uma instância Photon própria, com CORS habilitado, para maior volume. A busca envia somente o texto consultado e a referência geográfica inicial do Rio.
- Para contas públicas no Supabase, aplique `202611190002_public_service_accounts.sql` após as migrações anteriores. O cadastro grava órgão, esfera e cargo; `PUBLIC_AGENT` pode atualizar status de qualquer ocorrência pelo RPC autenticado. Não recebe acesso ao painel administrativo nem permissão para editar dados arbitrários ou promover perfis. O histórico grava o usuário autenticado em cada mudança.
- Cadastro institucional autodeclarado não comprova vínculo com o governo. Nenhum domínio de e-mail é tratado como verificação automática.
- Teste local: **Criar conta → Órgão público → preencher dados → clicar em ocorrência → Novo status → Atualizar status**. Para retornar com esse perfil, use o mesmo e-mail.
