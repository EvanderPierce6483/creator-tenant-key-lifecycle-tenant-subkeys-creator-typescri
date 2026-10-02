import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { clientFromEnvironment, InfraiError } from "./infrai-client";
import { TenantLifecycle, type TenantAccount } from "./tenant-lifecycle";

const onboardBody = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
}).strict();

const offboardBody = z.object({
  tenantId: z.string().min(1),
}).strict();

const accounts = new Map<string, TenantAccount>();
const lifecycle = new TenantLifecycle(clientFromEnvironment());

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/tenants/onboard") {
      const input = onboardBody.parse(await readJson(request));
      const created = await lifecycle.onboard({
        tenantId: input.tenantId,
        email: input.email,
        name: input.name,
      });
      const { key, ...account } = created;
      accounts.set(account.tenantId, account);
      send(response, 201, { account, key, note: "Store this key now; its plaintext cannot be retrieved again." });
      return;
    }

    if (request.method === "POST" && request.url === "/tenants/offboard") {
      const input = offboardBody.parse(await readJson(request));
      const account = accounts.get(input.tenantId);
      if (!account) {
        send(response, 404, { error: "Tenant account was not found" });
        return;
      }
      const updated = await lifecycle.offboard(account, (checkpoint) => {
        accounts.set(checkpoint.tenantId, checkpoint);
      });
      send(response, 200, updated);
      return;
    }

    send(response, 404, { error: "Route was not found" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      send(response, 400, { error: "Invalid request body", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, message: error.message });
      return;
    }
    send(response, 500, { error: "Service request failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Creator tenant service listening on http://localhost:${port}`));
