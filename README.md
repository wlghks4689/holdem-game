This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

### Multiplayer room storage

Online rooms need one shared Redis database on Vercel. Local `npm run dev`
uses in-process memory only when no storage variables are configured.
Do not use in-memory fallback on Vercel: separate function instances cannot share rooms.

Configure one of the following in the project's deployment environment:

- TCP Redis: `REDIS_URL` with a `redis://` or `rediss://` connection string.
  Supported names in precedence order: `HOLDEM_LIMIT_GAME_REDIS_URL`, `REDIS_URL`,
  `STORAGE_URL`, `UPSTASH_REDIS_URL`, `KV_URL`.
- REST Redis: `KV_REST_API_URL` (HTTPS) and `KV_REST_API_TOKEN` from the **same database**.
  Also supported: `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`,
  `STORAGE_REST_API_URL` / `STORAGE_REST_API_TOKEN`, and project-specific
  `HOLDEM_LIMIT_GAME_REST_API_URL` / `HOLDEM_LIMIT_GAME_REST_API_TOKEN`
  or `HOLDEM_LIMIT_GAME_KV_REST_API_URL` / `HOLDEM_LIMIT_GAME_KV_REST_API_TOKEN`.

Use a read/write token, not a read-only token. Never put credentials in
`NEXT_PUBLIC_*` variables. Valid TCP configuration takes precedence over REST;
remove stale TCP configuration when intentionally switching to REST. Requests do
not switch databases after a connection failure. Environment updates require a new
deployment and must be enabled for Production (and Preview when testing previews).

Room creation returns a safe diagnostic code:

- `ROOM_STORAGE_CONFIG`: missing, incomplete or invalid URL/token settings.
- `ROOM_STORAGE_DNS`: database hostname no longer resolves; check for an uninstalled
  integration or deleted database, reconnect an active database, then redeploy.
- `ROOM_STORAGE_AUTH`: expired/incorrect password or token.
- `ROOM_STORAGE_PERMISSION`: read-only database/token or missing write permission.
- `ROOM_STORAGE_LIMIT`: provider storage/request quota reached.
- `ROOM_STORAGE_UNAVAILABLE`: connection, timeout, or other storage failure.

Check the provider's database status and Vercel runtime logs for the failing
deployment. Never paste connection strings or tokens into bug reports.

Run `node scripts/verify-room-storage.cjs` for isolated storage regression and
two-player API tests (the real KV SDK against a mocked REST transport, no credentials
or external requests). Then verify create, join and game start on the target deployment
with two separate browser sessions. Local/mock success does not verify production credentials.

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
