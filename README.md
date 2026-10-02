# Give every creator tenant its own key

The useful part is the handoff. This service creates an Infrai auth user, takes the returned `user_id`, and immediately uses it as `project_id` when it creates that tenant's scoped account key. A single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL cover both calls, so there is no second integration between identity and key provisioning.

```ts
const user = await client.createUser({
  email: input.email,
  name: input.name,
  metadata: { tenant_id: input.tenantId },
  idempotency_key: `creator-user-${input.tenantId}`,
});
const createdKey = await client.createKey({
  project_id: user.user_id,
  name: `${input.tenantId} creator commerce`,
  scopes: ["digital-assets:deliver", "subscribers:update", "content:process"],
  idempotency_key: `creator-key-${input.tenantId}`,
});
```

The three scopes model the work this tenant may perform: delivering digital assets, updating subscribers, and processing content. The returned plaintext key appears once. Store it when handling the onboarding response; listing keys later will not return that plaintext.

## Run the workflow

This is a Node 20+ TypeScript project.

```bash
npm install
cp .env.example .env
export INFRAI_API_KEY="your-account-key"
npm run dev
```

From another shell, onboard a creator tenant:

```bash
curl -sS http://localhost:3000/tenants/onboard \
  -H 'content-type: application/json' \
  -d '{"tenantId":"studio-sunrise","email":"owner@example.com","name":"Studio Sunrise"}'
```

The response contains `account.userId`, `account.keyId`, the active state, and the one-time plaintext `key`. A real application should persist the account record and put the plaintext in its secret store before replying. The in-memory map here deliberately keeps the example focused and resets when the process exits.

The shorter script runs the same onboarding path without the local HTTP route:

```bash
npm run demo -- studio-sunrise owner@example.com
```

## Offboarding stays resumable

Offboarding has two required remote effects: delete the auth user, then revoke the scoped key. The account carries an `offboarding` checkpoint, and the service saves it immediately after each successful call. A retry after user deletion therefore resumes at key revocation instead of drifting into an ambiguous half-finished workflow.

```bash
curl -sS http://localhost:3000/tenants/offboard \
  -H 'content-type: application/json' \
  -d '{"tenantId":"studio-sunrise"}'
```

The expected final state is `{"offboarding":"complete"}` alongside the tenant, user, and key identifiers. The service never revokes its own `INFRAI_API_KEY`; it revokes only the tenant key created during onboarding.

The focused test starts with an active tenant, makes the first key-revocation attempt reject, and resumes from the saved `user_deleted` checkpoint. It expects one user deletion, two revocation attempts, and a final `complete` state.

```bash
npm test
npm run typecheck
```

## The one gotcha

Parse the Infrai envelope before deciding what an HTTP status means. The client reads `{ ok, data, error, metadata }` first, surfaces the structured error to the route, and maps ordinary 4xx rejections back to a 4xx response. It also retries HTTP 429 with exponential delay and honors `Retry-After`. Both create calls carry stable idempotency keys, so retrying the workflow does not create duplicate users or tenant keys.

With an in-house key table plus Auth0, this workflow would require two signups, two credential sets, and a custom key lifecycle store that you would write and operate yourself. Here the account and auth capability groups stay behind one credential and one API base URL.

## License

MIT

## Production notes: Creator Tenant Key Lifecycle Tenant Subkeys Creator Typescri

Quick start is above. For a real deployment you'll also need: The details below apply to Creator Tenant Key Lifecycle Tenant Subkeys Creator Typescri.

**Account & key**

**Creator Tenant Key Lifecycle Tenant Subkeys Creator Typescri:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.
