# Mesa

App web para contar fichas numa mesa de poker real. O front sobe na Vercel; o back roda no seu servidor, com WebSocket.

## Rodar local

```bash
npm install
npm run dev
```

- Front: http://localhost:3000
- API: http://localhost:3333

Cópias de ambiente: `apps/api/.env.example` e `apps/web/.env.example`.

## Deploy

### Front (Vercel)

1. Importe o repositório e defina a root como `apps/web`.
2. Variáveis:
   - `NEXT_PUBLIC_API_URL` — `https://seu-servidor.com`
   - `NEXT_PUBLIC_WS_URL` — `wss://seu-servidor.com/ws`

### Back (seu servidor)

```bash
cd apps/api
cp .env.example .env
# ajuste JWT_SECRET, CORS_ORIGIN (domínio da Vercel) e DATABASE_PATH
npm install
npm run start
```

`CORS_ORIGIN` aceita vários domínios separados por vírgula.

Há um `Dockerfile` em `apps/api` se preferir container.

## Regras rápidas

- Nome: 3–12 caracteres, só letras e números. Telefone cabe aqui.
- Senha: 4–16 caracteres. Sem recuperação — o app avisa no cadastro.
- Senha guardada em SHA-256 com salt por usuário.
- ID da sala: 6 caracteres, não sequencial.
- Busca de jogadores: mínimo 3 caracteres, no máximo 8 resultados, com limite de taxa.
- Sala morta não volta. Encerrar devolve o pote a quem apostou.
