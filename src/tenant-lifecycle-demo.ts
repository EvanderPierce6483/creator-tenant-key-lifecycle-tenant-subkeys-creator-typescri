import { clientFromEnvironment } from "./infrai-client";
import { TenantLifecycle } from "./tenant-lifecycle";

const tenantId = process.argv[2] ?? "studio-sunrise";
const lifecycle = new TenantLifecycle(clientFromEnvironment());
const created = await lifecycle.onboard({
  tenantId,
  email: process.argv[3] ?? "owner@example.com",
  name: "Studio Sunrise",
});

console.log(JSON.stringify({ ...created, key: "[store the returned plaintext securely]" }, null, 2));
