import assert from "node:assert/strict";
import test from "node:test";
import type { CreateKeyInput, CreateUserInput, CreatedKey, CreatedUser, TenantGateway } from "../src/infrai-client";
import { TenantLifecycle, type TenantAccount } from "../src/tenant-lifecycle";

test("offboarding resumes key revocation after user deletion succeeds", async () => {
  const calls: string[] = [];
  let firstRevocation = true;
  const gateway: TenantGateway = {
    createUser: async (_input: CreateUserInput): Promise<CreatedUser> => ({ user_id: "user-7" }),
    createKey: async (_input: CreateKeyInput): Promise<CreatedKey> => ({ key_id: "key-7", key_secret: "test-value" }),
    deleteUser: async (id) => { calls.push(`delete:${id}`); },
    revokeKey: async (id) => {
      calls.push(`revoke:${id}`);
      if (firstRevocation) {
        firstRevocation = false;
        throw new Error("simulated boundary rejection");
      }
    },
  };
  const lifecycle = new TenantLifecycle(gateway);
  const active: TenantAccount = {
    tenantId: "studio-sunrise",
    userId: "user-7",
    keyId: "key-7",
    offboarding: "active",
  };

  let checkpoint: TenantAccount = active;
  await assert.rejects(() => lifecycle.offboard(active, (saved) => { checkpoint = saved; }));
  assert.equal(checkpoint.offboarding, "user_deleted");
  const complete = await lifecycle.offboard(checkpoint, (saved) => { checkpoint = saved; });

  assert.equal(complete.offboarding, "complete");
  assert.equal(checkpoint.offboarding, "complete");
  assert.deepEqual(calls, ["delete:user-7", "revoke:key-7", "revoke:key-7"]);
});
