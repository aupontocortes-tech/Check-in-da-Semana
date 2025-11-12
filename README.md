# Check-in da Semana 💥 | Naty Personal

App React + Tailwind para formulário público de check-in e painel administrativo privado, com backend Express com suporte a SQLite (sql.js) ou Postgres, e fallback para filesystem.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new?template=https://github.com/aupontocortes-tech/Check-in-da-Semana)

> Clique no botão acima para criar e publicar o backend automaticamente no Railway. Depois copie a URL gerada e defina como `VITE_API_BASE` no Vercel.

## Scripts

- `npm run dev` — inicia Vite (frontend) e API (backend)
- `npm run build` — build do frontend
- `npm run preview` — preview do frontend

## Configuração

- Crie um arquivo `.env` baseado em `.env.example` para definir credenciais e variáveis.
- Banco de dados: configure `DATABASE_URL` (Postgres/Neon) ou habilite SQLite via `USE_SQLITE=true` (opcional `SQLITE_PATH`). Se nenhuma opção for definida, o backend usa fallback local em `data/`.
- Para produção, defina em seu provedor:
  - Backend: `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_KEY`, `CORS_ORIGIN`, `PORT` e, opcionalmente, `SMTP_*`, `EMAIL_FROM`, `WABA_*`, `REPORT_WEBHOOK_URL`.
  - Frontend (Vercel): `VITE_API_BASE`, `VITE_ADMIN_USERNAME`, `VITE_ADMIN_KEY`.

> Dica: se as variáveis não forem definidas, o app usa padrão `professor` / `0808` para login de administrador.

### Deploy Backend (Render)

1. Fazer fork/import do repo no Render.
2. Render detecta `render.yaml` e cria o serviço Web automaticamente.
3. Iniciar com plano gratuito, start: `npm start`.
4. Ajustar `CORS_ORIGIN` para seu domínio Vercel.
5. Configurar `DATABASE_URL` como Secret (Neon) nas Environment Variables.
6. Copiar a URL pública (ex.: `https://seu-backend.onrender.com`).

### Deploy Backend (Railway)

1. Crie um projeto no Railway e conecte seu repositório.
2. Railway detecta Node e usa `npm start` (já presente em `package.json`).
3. Defina variáveis de ambiente: `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_KEY`, `CORS_ORIGIN` (domínio do Vercel) e, opcionalmente, `SMTP_*`, `EMAIL_FROM`.
4. O Railway fornece `PORT` automaticamente — o backend já respeita `process.env.PORT`.
5. Após deploy, copie a URL pública (ex.: `https://seu-backend.up.railway.app`).
6. Teste saúde do serviço: `GET https://SEU_BACKEND/health` deve responder `{ ok: true }`.

> Se usa previews do Vercel (URLs temporárias), inclua também `CORS_ORIGIN_2` e `CORS_ORIGIN_3` com esses domínios.

### Deploy Frontend (Vercel)

1. Importar o repositório do GitHub.
2. Framework: Vite; Build: `npm run build`; Output: `dist`.
3. Variáveis: `VITE_API_BASE=<URL_DO_BACKEND>`, `VITE_ADMIN_USERNAME=professor`, `VITE_ADMIN_KEY=0808`.
4. O rewrite de `/api/*` foi removido do `vercel.json`. O frontend chama diretamente o backend em `VITE_API_BASE` (normalizado com ou sem `/api`).
5. Garanta que o backend permita CORS para o domínio Vercel: defina `CORS_ORIGIN=https://SEU_SITE.vercel.app` (e `CORS_ORIGIN_2/3` para previews, se necessário).
6. Redeploy e testar `https://SEU_SITE.vercel.app/admin`.

### Armazenamento de dados

- SQLite (sql.js):
  - `checkins_app`: armazena cada envio do formulário em `payload TEXT` (JSON string) com `created_at`.
  - `profile_app`: armazena o perfil público (foto, e-mail, WhatsApp) em `payload TEXT`.
  - Arquivo: `data/app.sqlite` por padrão (customizável via `SQLITE_PATH`).
- Postgres (Neon):
  - `checkins_app`: armazena cada envio do formulário em `payload JSONB` com `created_at`.
  - `profile_app`: armazena o perfil público (foto, e-mail, WhatsApp) em `payload JSONB`.
- Fallback local: se não houver DB (nem `DATABASE_URL`, nem `USE_SQLITE`), o backend usa `data/checkins.json` e `data/profile.json`.
- Migração automática: na primeira inicialização com DB (SQLite ou Postgres), o backend importa o conteúdo de `data/profile.json` para `profile_app` se a tabela estiver vazia.

### Health e observabilidade

- `GET /health` responde com `{ ok: true, ts, db }`.
- Campo `db` inclui `enabled`, `checkins_count` e `profile_rows` quando um banco está configurado (SQLite ou Postgres).

### Troubleshooting (produção)

- Foto não salva no site:
  - Verifique se o backend está ativo e acessível (`GET /health`).
  - Confirme `VITE_API_BASE` no Vercel apontando para o backend.
  - Confirme CORS no backend: `CORS_ORIGIN` deve ser exatamente o domínio do seu site.
  - No DevTools → Network, verifique `POST /api/profile` com status `200` e resposta `{ ok: true }`.
  - Se houver `CORS error`, ajuste `CORS_ORIGIN` (e `CORS_ORIGIN_2/3` para previews) e redeploy no backend.

> Dica: em desenvolvimento o app usa `http://localhost:5175`. Em produção, sempre use `VITE_API_BASE` para evitar fallbacks em hosts suspensos.

### Envio automático para WhatsApp

- Aluno envia o formulário e o app abre automaticamente o WhatsApp do treinador (Click-to-Chat) com a mensagem preenchida.
- O número do treinador é gerenciado no painel Admin em “Configurações de contato” e salvo em `localStorage`.
- Opcional: configurar WhatsApp Cloud API no backend (`WABA_TOKEN`, `WABA_PHONE_ID`) para envio direto sem abrir o WhatsApp.
