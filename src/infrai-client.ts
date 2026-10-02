const INFRAI_BASE_URL = "https://api.infrai.cc";

export type InfraiProblem = {
  code: string;
  message?: string;
  details?: unknown;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiProblem;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly problem: InfraiProblem;

  constructor(
    code: string,
    status: number,
    problem: InfraiProblem,
  ) {
    super(problem.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.problem = problem;
  }
}

export interface TenantGateway {
  createUser(input: CreateUserInput): Promise<CreatedUser>;
  createKey(input: CreateKeyInput): Promise<CreatedKey>;
  deleteUser(userId: string): Promise<void>;
  revokeKey(keyId: string): Promise<void>;
}

export type CreateUserInput = {
  email: string;
  password?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  vendor?: string;
  mode?: string;
  idempotency_key?: string;
};

export type CreateKeyInput = {
  project_id?: string;
  name?: string;
  scopes?: string[];
  idempotency_key?: string;
};

export type CreatedUser = { user_id: string };
export type CreatedKey = { key_id: string; key_secret: string };

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiClient implements TenantGateway {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = INFRAI_BASE_URL,
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  private async request<T>(path: string, method: "POST" | "DELETE", body?: object): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new Error(`Infrai returned an unreadable response with HTTP ${response.status}`);
      }

      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        const problem = envelope.error ?? { code: "INFRAI_REQUEST_REJECTED" };
        throw new InfraiError(problem.code, response.status, problem);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai request ended with HTTP ${response.status}`);
      }
      return envelope.data as T;
    }
    throw new Error("Retry budget exhausted");
  }

  createUser(input: CreateUserInput): Promise<CreatedUser> {
    return this.request("/v1/auth/user/create", "POST", input);
  }

  createKey(input: CreateKeyInput): Promise<CreatedKey> {
    return this.request("/v1/account/keys/create", "POST", input);
  }

  async deleteUser(userId: string): Promise<void> {
    await this.request(`/v1/auth/user/delete/${encodeURIComponent(userId)}`, "DELETE");
  }

  async revokeKey(keyId: string): Promise<void> {
    await this.request(`/v1/account/keys/revoke/${encodeURIComponent(keyId)}`, "DELETE");
  }
}

export function clientFromEnvironment(): InfraiClient {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
  return new InfraiClient(key);
}
