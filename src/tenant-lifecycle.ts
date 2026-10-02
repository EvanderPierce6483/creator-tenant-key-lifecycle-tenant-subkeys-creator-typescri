import type { TenantGateway } from "./infrai-client";

export const CREATOR_SCOPES = [
  "digital-assets:deliver",
  "subscribers:update",
  "content:process",
] as const;

export type TenantAccount = {
  tenantId: string;
  userId: string;
  keyId: string;
  offboarding: "active" | "user_deleted" | "complete";
};

export type OnboardCreator = {
  tenantId: string;
  email: string;
  name: string;
};

export type OnboardedCreator = TenantAccount & { key: string };

export class TenantLifecycle {
  private readonly gateway: TenantGateway;

  constructor(gateway: TenantGateway) {
    this.gateway = gateway;
  }

  async onboard(input: OnboardCreator): Promise<OnboardedCreator> {
    const user = await this.gateway.createUser({
      email: input.email,
      name: input.name,
      metadata: { tenant_id: input.tenantId },
      idempotency_key: `creator-user-${input.tenantId}`,
    });
    const createdKey = await this.gateway.createKey({
      project_id: user.user_id,
      name: `${input.tenantId} creator commerce`,
      scopes: [...CREATOR_SCOPES],
      idempotency_key: `creator-key-${input.tenantId}`,
    });

    return {
      tenantId: input.tenantId,
      userId: user.user_id,
      keyId: createdKey.key_id,
      key: createdKey.key_secret,
      offboarding: "active",
    };
  }

  async offboard(
    account: TenantAccount,
    save: (account: TenantAccount) => void | Promise<void> = () => {},
  ): Promise<TenantAccount> {
    let next = account;
    if (next.offboarding === "active") {
      await this.gateway.deleteUser(next.userId);
      next = { ...next, offboarding: "user_deleted" };
      await save(next);
    }
    if (next.offboarding === "user_deleted") {
      await this.gateway.revokeKey(next.keyId);
      next = { ...next, offboarding: "complete" };
      await save(next);
    }
    return next;
  }
}
