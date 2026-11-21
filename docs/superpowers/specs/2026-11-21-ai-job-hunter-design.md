# AI Job Hunter — Design

Data: 2026-11-21 · Estado: rascunho para aprovação

## 1. Intenção e porquê

Aplicação web full stack para quem procura emprego, usando IA para analisar o CV, encontrar ofertas compatíveis, escrever cartas de apresentação e treinar entrevistas.

**Porquê:** peça de portefólio do Rafael. Tem de estar **online, totalmente funcional e o mais próxima possível de uma aplicação real**. O público que conta é um recrutador ou alguém técnico que lhe dá 2 a 5 minutos: abre o link, experimenta, e talvez espreite o código no GitHub.

**Sucesso:**
- O visitante abre o link e a app responde logo, sem esperar que o servidor "acorde".
- Em menos de 1 minuto, com a conta demo, vê o fluxo completo: CV analisado → ofertas reais compatíveis → carta gerada → entrevista simulada.
- O repositório parece trabalho profissional: testes, CI, README com capturas e diagrama, commits atómicos.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos (v1)**
1. Contas reais (registo/login) e **conta demo** de um clique com dados de exemplo.
2. Upload de CV (PDF/DOCX) → análise automática estruturada + sugestões de melhoria.
3. Ofertas **reais** vindas de APIs públicas, importadas periodicamente para a nossa base de dados; pesquisa e filtros.
4. Matching CV↔ofertas: pontuação, competências em comum, lacunas e explicação.
5. Oferta colada manualmente (texto) como alternativa.
6. Carta de apresentação gerada por IA para uma oferta, editável, copiável e exportável.
7. Simulador de entrevista em texto (chat com streaming), com feedback por resposta e relatório final.
8. Limites de uso de IA por conta.

**Não-objetivos (v1):** entrevista por voz; candidatura automática às ofertas; quadro kanban de candidaturas (fica como extra, se houver tempo); app móvel nativa; pagamentos.

**Anti-objetivos (falha mesmo que "funcione"):**
- Demo lenta ou partida no primeiro clique.
- Recolha automática (scraping) de sites como LinkedIn/Indeed: frágil e contra os termos de uso.
- Chave de IA sem limites, que um visitante possa esgotar.
- CVs de um utilizador visíveis a outro.
- Código "de tutorial" sem testes.

## 3. Restrições

- Alojamento e serviços **em planos gratuitos** sempre que possível; o único custo esperado é o uso da API de IA, controlado por limites.
- Limites das APIs de ofertas: Adzuna ~250 pedidos/dia (chave gratuita), Remotive no máximo ~4 pedidos/dia (feed com 24 h de atraso), Arbeitnow sem chave. Daí a importação periódica em vez de chamadas por pesquisa.
- Na Vercel Hobby, as funções têm tempo máximo limitado e o cron nativo só corre uma vez por dia.
- Segredos (chaves) só em variáveis de ambiente; nunca no repositório.
- RGPD: o utilizador pode apagar a conta, e isso apaga todos os seus dados (CVs incluídos).

## 4. Abordagens consideradas

| | Abordagem | Prós | Contras |
|---|---|---|---|
| **A** ✅ | **Next.js tudo-em-um (TypeScript) na Vercel + Postgres na Neon** | Uma base de código; não adormece; streaming de IA nativo; deploy simples | Não há backend separado para mostrar |
| B | React + FastAPI (Python) + Postgres + worker | Arquitetura clássica e Python | Dois deploys; o backend gratuito adormece (30 s ou mais no primeiro clique) |
| C | React + NestJS | Tudo em TS, backend separado | Mesmos contras de B, com menos vantagens |

**Escolhida: A** (decisão do Rafael). Uma demo que responde logo pesa mais, num portefólio, do que um backend separado.

## 5. Arquitetura (A)

```
Browser ──► Next.js (App Router, Vercel)
             ├─ UI: React Server Components + Tailwind + shadcn/ui
             ├─ Server Actions / Route Handlers (API)
             ├─ Auth.js (credenciais + GitHub OAuth)
             ├─ Camada de IA (Vercel AI SDK) ──► Anthropic Claude
             │                               └─► Embeddings (Voyage AI)
             ├─ /api/cron/ingest (protegido por segredo)
             └─ Vercel Blob (ficheiros de CV)
           ──► Neon Postgres + pgvector (Prisma ORM)
GitHub Actions (cron de 6 em 6 h) ──► /api/cron/ingest
Adzuna / Arbeitnow / Remotive ◄── ingest
```

### Decisões técnicas (escolhas minhas, corrigíveis)
- **Next.js (versão estável atual) + TypeScript estrito**, App Router.
- **UI:** Tailwind + shadcn/ui; tema claro/escuro; responsivo.
- **Idioma:** interface em **inglês e português** (next-intl), para servir recrutadores internacionais e portugueses. A IA responde no idioma que o utilizador escolher.
- **BD:** Neon Postgres com **pgvector**; ORM **Prisma** com migrações.
- **Auth:** Better Auth (sucessor recomendado do Auth.js; ver ADR 0004) com email+password e GitHub OAuth (v1.2). Conta demo: sessão temporária com dados de exemplo, reposta periodicamente.
- **Ficheiros:** Vercel Blob (privado), com limite de 5 MB e tipos PDF/DOCX.
- **Parsing:** `unpdf` para PDF e `mammoth` para DOCX → texto.
- **IA:** Vercel AI SDK com fornecedor Anthropic (trocável, por exemplo para OpenRouter). Modelo rápido e barato (Claude Haiku) para extração estruturada e re-ranking; modelo forte (Claude Sonnet) para cartas e entrevistas. Saídas estruturadas validadas com **Zod**.
- **Embeddings:** Voyage AI (plano gratuito); a Anthropic não tem endpoint de embeddings. Atrás de uma interface, para poder trocar.
- **Limites de uso:** contador diário por utilizador e por tipo de ação, guardado na BD (por exemplo 3 análises, 10 cartas, 5 entrevistas por dia; a conta demo tem limites próprios partilhados). Mais um limite global diário de custo.
- **Importação de ofertas:** adaptadores por fonte (`JobSource` → oferta normalizada), deduplicação por hash de (título, empresa, localização), expiração de ofertas antigas (> 30 dias) e embedding de cada oferta nova. Disparada por GitHub Actions de 6 em 6 h (Remotive no máximo 1 vez por dia).
- **Observabilidade:** logs estruturados e registo de cada chamada de IA (tokens, custo estimado, duração) numa tabela, para o painel de uso.

## 6. Funcionalidades em detalhe

### 6.1 Upload e análise de CV
- Upload → texto extraído → IA devolve um **perfil estruturado**: nome, título, senioridade, anos de experiência, competências (técnicas/soft, com nível), experiências, formação, idiomas, localização e preferências.
- **Relatório de análise:** pontuação global (0–100) e por secção (clareza, impacto/quantificação, compatibilidade com sistemas ATS, competências), pontos fortes e sugestões concretas de melhoria.
- O utilizador pode editar o perfil extraído. Pode ter vários CVs, com um marcado como ativo.

### 6.2 Ofertas e matching
- Página de ofertas: pesquisa por texto, localização, remoto/presencial e fonte; paginação.
- **Matching em 2 fases:** (1) semelhança por embeddings entre o perfil e as ofertas, que dá os 50 melhores candidatos; (2) re-ranking por IA dos 10 melhores, com pontuação 0–100, competências em comum, lacunas e um parágrafo de explicação. O resultado fica em cache por (CV, oferta).
- **Oferta manual:** colar o texto de uma oferta → é normalizada pela IA e tratada como as outras.
- Cada oferta tem link para o anúncio original. Guardar oferta como favorita.

### 6.3 Carta de apresentação
- A partir de (CV ativo, oferta): tom (formal/neutro/entusiasta), idioma e tamanho.
- Geração com streaming; editor de texto; regenerar; copiar; exportar para PDF; histórico por oferta.
- Regra: a carta só usa factos que estejam no CV (sem inventar experiência).

### 6.4 Simulador de entrevista
- Escolher a oferta (ou um papel genérico), o tipo (comportamental, técnica, mista), a dificuldade e o número de perguntas (5–10).
- Chat em streaming: a IA faz uma pergunta de cada vez, adaptada ao CV e à oferta. Depois de cada resposta dá feedback curto e pode fazer uma pergunta de seguimento.
- **Relatório final:** pontuação por critério (clareza, relevância, estrutura STAR, profundidade técnica), pontos fortes, a melhorar e respostas-modelo. Fica no histórico.

### 6.5 Conta e painel
- Dashboard: CV ativo e a sua pontuação, melhores matches, cartas e entrevistas recentes, uso diário restante.
- Definições: idioma, apagar conta (apaga tudo).

## 7. Qualidade e entrega
- **Testes:** Vitest para unidades (adaptadores, parsing, prompts e validação, limites) com a IA e as APIs mockadas; testes de integração da BD; **Playwright** e2e para os fluxos principais, com a IA mockada.
- **CI (GitHub Actions):** lint, verificação de tipos, testes e build em cada push/PR.
- **README:** demo ao vivo, GIF/capturas, diagrama da arquitetura, stack, como correr localmente, decisões (ADRs em `docs/adr/`).
- **Local:** `docker compose` com Postgres+pgvector; `.env.example`; *seed* com dados demo.
- **Repositório:** público na conta GitHub do Rafael (nome proposto: `ai-job-hunter`), um commit por tarefa atómica testada, com o autor Rafael.

## 7.1 Decisões tomadas após a revisão (escolhas minhas, corrigíveis)
- **Conta demo isolada por visitante:** "Experimentar demo" cria um utilizador temporário com uma **cópia** dos dados de exemplo; expira e é apagado ao fim de 24 h (limpeza no mesmo cron). Ninguém vê o que outro visitante fez. Há proteção contra abuso: limite de contas demo por IP por dia e captcha leve (Cloudflare Turnstile).
- **Demo instantânea:** os dados de exemplo trazem resultados de IA **reais pré-gerados** (análise do CV, matches, uma carta e uma entrevista concluída), refrescados quando o cron importa ofertas. Assim o fluxo completo vê-se em segundos. Ações novas fazem chamadas reais, com limites pequenos (por exemplo 1 análise, 2 cartas, 1 entrevista).
- **Verificação de email e recuperação de password incluídas** (realismo), via Resend (plano gratuito). Junta-se à lista de contas do Rafael.
- **Repositório:** a app vive neste workspace (`H:\Projects\Claude-project1`), que passa a ser o repositório git `ai-job-hunter`. As convenções existentes mantêm-se: issues em `.scratch/`, `GLOSSARY.md` e `docs/adr/`.

## 7.2 Mercado e fases (decididos pelo Rafael)
- **Mercado:** Portugal (Adzuna, país `pt`) + trabalho remoto (Remotive, Arbeitnow). As fontes e os países ficam numa configuração, para juntar outros sem mudar o código.
- **Sem prazo. Entrega por fases**, cada uma publicada online e utilizável:
  - **v1:** autenticação (email+password, verificação, recuperação) + conta demo; upload e análise de CV; importação de ofertas + pesquisa + matching; oferta manual; carta de apresentação; limites de uso; CI; deploy.
  - **v1.1:** simulador de entrevista; exportar carta para PDF.
  - **v1.2:** interface bilingue PT/EN (até lá, só inglês); vários CVs por utilizador; login com GitHub.
  - **Extra:** quadro de candidaturas.

## 8. O que fica para quem constrói
- Versões exatas das bibliotecas, estrutura de pastas e nomes internos.
- Texto e afinação dos prompts.
- Valores exatos dos limites de uso e do cron (dentro do espírito acima).
- Design visual em detalhe (deve ser limpo, moderno e distinto, não um template genérico).

## 9. O que o Rafael tem de fazer (passos que só ele pode fazer)
- Criar contas/chaves: Anthropic, Voyage AI, Adzuna, Neon, Vercel (e Vercel Blob), GitHub OAuth app.
- `gh auth login` (ou credenciais git) para permitir push.
- Pôr as chaves nas variáveis de ambiente da Vercel e no `.env.local`.
