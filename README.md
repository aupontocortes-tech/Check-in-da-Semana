# Check-in da Semana 💥 | Naty Personal

App React + Tailwind para formulário público de check-in e painel administrativo privado, com backend Express + SQLite.

## Scripts

- `npm run dev` — inicia Vite (frontend) e API (backend)
- `npm run build` — build do frontend
- `npm run preview` — preview do frontend

## Configuração

- Crie um arquivo `.env` baseado em `.env.example` para definir credenciais e variáveis.
- Para produção, defina em seu provedor:
  - Backend: `ADMIN_USERNAME`, `ADMIN_KEY`, `CORS_ORIGIN`, `PORT` e, opcionalmente, `SMTP_*`, `EMAIL_FROM`, `WABA_*`.
  - Frontend (Vercel): `VITE_API_BASE`, `VITE_ADMIN_USERNAME`, `VITE_ADMIN_KEY`.

### Deploy Backend (Render)

1. Fazer fork/import do repo no Render.
2. Render detecta `render.yaml` e cria o serviço Web automaticamente.
3. Iniciar com plano gratuito, start: `npm start`.
4. Ajustar `CORS_ORIGIN` para seu domínio Vercel.
5. Copiar a URL pública (ex.: `https://seu-backend.onrender.com`).

### Deploy Frontend (Vercel)

1. Importar o repositório do GitHub.
2. Framework: Vite; Build: `npm run build`; Output: `dist`.
3. Variáveis: `VITE_API_BASE=<URL_DO_BACKEND>`, `VITE_ADMIN_USERNAME=professor`, `VITE_ADMIN_KEY=0808`.
4. Redeploy e testar `https://SEU_SITE.vercel.app/admin`.

### Envio automático para WhatsApp

- Aluno envia o formulário e o app abre automaticamente o WhatsApp do treinador (Click-to-Chat) com a mensagem preenchida.
- O número do treinador é gerenciado no painel Admin em “Configurações de contato” e salvo em `localStorage`.
- Opcional: configurar WhatsApp Cloud API no backend (`WABA_TOKEN`, `WABA_PHONE_ID`) para envio direto sem abrir o WhatsApp.
