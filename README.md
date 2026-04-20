# EVE Wealth OS (Live 24h)

Painel de mineração + fabricação + PLEX com modo **real-time** usando EVE SSO + ESI.

## O que já está em tempo real

- Skills principais (Mining, Astrogeology, Reprocessing, Industry, Mass Production, Accounting, Broker Relations, Supply Chain)
- Wallet
- Skill queue
- Orders
- Industry jobs
- Mining ledger (quantidade/entradas)
- Mercado público (inclui PLEX e ores usados no painel)

## Requisitos

- Node.js 18+
- Aplicação EVE SSO criada no developers.eveonline.com

## Configuração

1. Copia `.env.example` para `.env` e preenche `EVE_CLIENT_ID` e `EVE_CLIENT_SECRET`.
2. Na app do EVE, define callback URL para:
   - `http://127.0.0.1:3000/auth/eve/callback`

## Rodar

```bash
npm start
```

Abre no browser:

- `http://127.0.0.1:3000`

> Não uses `file://.../index.html` para modo live.

## Fluxo live

1. Clica `Conectar EVE SSO`.
2. Autoriza os scopes.
3. O servidor passa a atualizar dados automaticamente a cada ~60s.
4. O frontend consulta snapshot a cada ~15s.

## Rodar 24h

Para deixar em execução contínua:

```bash
nohup npm start > eve-wealth.log 2>&1 &
```

Depois abre `http://127.0.0.1:3000`.

## Segurança

- Token fica em `.data/eve-token.json` localmente.
- Não subir `.env` e `.data/` para git público.
