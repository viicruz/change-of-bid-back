//* Libraries imports
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Local imports
import { app } from "./app";
import { db } from "./db/index";
import { user } from "./db/schema";

const password = "Correct-horse-battery-1";
const createdEmails: string[] = [];

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

const baseUrl = requiredEnv("BETTER_AUTH_URL", process.env.BETTER_AUTH_URL);
const pageOrigin = requiredEnv("PAGE_ORIGIN", process.env.PAGE_ORIGIN);

type RegisteredUser = {
  email: string;
  password: string;
  userId: string;
  token: string;
  sessionCookie: string;
};

function request(
  path: string,
  headers?: RequestInit["headers"],
  method = "GET",
  body?: string,
) {
  return new Request(`${baseUrl}${path}`, {
    method,
    headers,
    body,
  });
}

function getRequestWithBody(path: string, body: string) {
  const posted = request(
    path,
    { "content-type": "application/json" },
    "POST",
    body,
  );

  // Fetch rejects a body on GET. The proxy keeps that body and reports GET.
  return new Proxy(posted, {
    get(target, property) {
      if (property === "method") return "GET";

      const value = Reflect.get(target, property, target);

      if (typeof value === "function") {
        return value.bind(target);
      }

      return value;
    },
  }) as Request;
}

function readSessionCookie(response: Response) {
  const sessionCookie = response
    .headers
    .getSetCookie()
    .find((cookie) => cookie.includes("session_token="));
  const pair = sessionCookie?.split(";")[0];

  if (!pair) {
    throw new Error("Sign-up did not set a session cookie");
  }

  return pair;
}

function alterLastCharacter(token: string) {
  const lastCharacter = token.charAt(token.length - 1);
  const replacement = lastCharacter === "a" ? "b" : "a";

  return `${token.slice(0, -1)}${replacement}`;
}

async function expectUnauthorized(response: Response, email: string) {
  expect(response.status).toBe(401);

  const body = await response.text();

  expect(body).not.toContain(email);
}

async function registerUser(): Promise<RegisteredUser> {
  const email = `auth-bypass-${crypto.randomUUID()}@example.com`;
  const response = await app.handle(
    request(
      "/api/auth/sign-up/email",
      {
        "content-type": "application/json",
        origin: pageOrigin,
      },
      "POST",
      JSON.stringify({
        name: "Auth Bypass",
        email,
        password,
      }),
    ),
  );
  const rawBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Sign-up failed with status ${response.status}: ${rawBody}`,
    );
  }

  createdEmails.push(email);

  const body = JSON.parse(rawBody) as {
    user?: {
      id?: string;
    };
  };
  const userId = body.user?.id;
  const token = response.headers.get("set-auth-token");

  if (!userId) {
    throw new Error("Sign-up did not return a user id");
  }

  if (!token) {
    throw new Error("Sign-up did not return a bearer token");
  }

  return {
    email,
    password,
    userId,
    token,
    sessionCookie: readSessionCookie(response),
  };
}

async function deleteUserByEmail(email: string) {
  await db.delete(user).where(eq(user.email, email));
}

describe("API authentication", () => {
  afterEach(async () => {
    const emails = createdEmails.splice(0, createdEmails.length);

    await Promise.all(emails.map((email) => deleteUserByEmail(email)));
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("GET /user", () => {
    describe("requests without a valid session", () => {
      it("rejects a request with no credentials", async () => {
        const account = await registerUser();
        const response = await app.handle(request("/user"));

        await expectUnauthorized(response, account.email);
      });

      it("rejects an empty bearer token", async () => {
        const account = await registerUser();
        const response = await app.handle(
          request("/user", { authorization: "Bearer " }),
        );

        await expectUnauthorized(response, account.email);
      });

      it("rejects a bearer token of null", async () => {
        const account = await registerUser();
        const response = await app.handle(
          request("/user", { authorization: "Bearer null" }),
        );

        await expectUnauthorized(response, account.email);
      });

      it("rejects a bearer token of undefined", async () => {
        const account = await registerUser();
        const response = await app.handle(
          request("/user", { authorization: "Bearer undefined" }),
        );

        await expectUnauthorized(response, account.email);
      });

      it("rejects a random bearer token", async () => {
        const account = await registerUser();
        const response = await app.handle(
          request("/user", {
            authorization: `Bearer ${crypto.randomUUID()}`,
          }),
        );

        await expectUnauthorized(response, account.email);
      });

      it("rejects a JWT with alg none", async () => {
        const account = await registerUser();
        const token =
          "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhdHRhY2tlciJ9.";
        const response = await app.handle(
          request("/user", { authorization: `Bearer ${token}` }),
        );

        await expectUnauthorized(response, account.email);
      });

      it("rejects a SQL-like bearer token", async () => {
        const account = await registerUser();
        const response = await app.handle(
          request("/user", { authorization: "Bearer ' OR 1=1; --" }),
        );

        await expectUnauthorized(response, account.email);
      });

      it("rejects the account password sent as Basic auth", async () => {
        const account = await registerUser();
        const credentials = Buffer.from(
          `${account.email}:${account.password}`,
        ).toString("base64");
        const response = await app.handle(
          request("/user", { authorization: `Basic ${credentials}` }),
        );

        await expectUnauthorized(response, account.email);
      });

      it("rejects a token sent only as a query parameter", async () => {
        const account = await registerUser();
        const response = await app.handle(
          request(`/user?token=${encodeURIComponent(account.token)}`),
        );

        await expectUnauthorized(response, account.email);
      });

      it("rejects a token sent only in the request body", async () => {
        const account = await registerUser();
        const response = await app.handle(
          getRequestWithBody(
            "/user",
            JSON.stringify({ token: account.token }),
          ),
        );

        await expectUnauthorized(response, account.email);
      });

      it("rejects a forged session cookie", async () => {
        const account = await registerUser();
        const response = await app.handle(
          request("/user", {
            cookie: "better-auth.session_token=forged-session-token",
          }),
        );

        await expectUnauthorized(response, account.email);
      });

      it("rejects spoofed identity headers when no session is present", async () => {
        const account = await registerUser();
        const response = await app.handle(
          request("/user", {
            "x-user-id": account.userId,
            "x-user-email": account.email,
            auth: "true",
          }),
        );

        await expectUnauthorized(response, account.email);
      });

      it("rejects an authorization header that glues an invalid token to a valid one", async () => {
        const account = await registerUser();
        const response = await app.handle(
          request("/user", {
            authorization: `Bearer invalid${account.token}`,
          }),
        );

        await expectUnauthorized(response, account.email);
      });

      it("rejects a valid token with its last character changed", async () => {
        const account = await registerUser();
        const response = await app.handle(
          request("/user", {
            authorization: `Bearer ${alterLastCharacter(account.token)}`,
          }),
        );

        await expectUnauthorized(response, account.email);
      });

      it.each(["/user/", "/User", "/user%2f"])(
        "does not return the user for %s without a session",
        async (path) => {
          const account = await registerUser();
          const response = await app.handle(request(path));
          const body = await response.text();

          expect([401, 404]).toContain(response.status);
          expect(body).not.toContain(account.email);
        },
      );
    });

    describe("requests with a valid session", () => {
      it("returns the authenticated user when the bearer token is valid", async () => {
        const account = await registerUser();
        const response = await app.handle(
          request("/user", { authorization: `Bearer ${account.token}` }),
        );
        const body = (await response.json()) as { email?: string };

        expect(response.status).toBe(200);
        expect(body.email).toBe(account.email);
      });

      it("returns the authenticated user when the session cookie is valid", async () => {
        const account = await registerUser();
        const response = await app.handle(
          request("/user", { cookie: account.sessionCookie }),
        );
        const body = (await response.json()) as { email?: string };

        expect(response.status).toBe(200);
        expect(body.email).toBe(account.email);
      });

      it("returns the user bound to the bearer token when identity headers name someone else", async () => {
        const account = await registerUser();
        const otherAccount = await registerUser();
        const response = await app.handle(
          request("/user", {
            authorization: `Bearer ${account.token}`,
            "x-user-id": otherAccount.userId,
            "x-user-email": otherAccount.email,
            auth: "true",
          }),
        );
        const body = (await response.json()) as {
          email?: string;
          id?: string;
        };

        expect(response.status).toBe(200);
        expect(body.email).toBe(account.email);
        expect(body.id).toBe(account.userId);
      });
    });

    describe("session invalidation", () => {
      it("rejects a bearer token after sign-out", async () => {
        const account = await registerUser();
        const signOutResponse = await app.handle(
          request(
            "/api/auth/sign-out",
            {
              authorization: `Bearer ${account.token}`,
              origin: pageOrigin,
            },
            "POST",
          ),
        );

        expect(signOutResponse.ok).toBe(true);

        const response = await app.handle(
          request("/user", { authorization: `Bearer ${account.token}` }),
        );

        await expectUnauthorized(response, account.email);
      });
    });
  });

  describe("GET /", () => {
    it("returns the public payload when no credentials are sent", async () => {
      const response = await app.handle(request("/"));

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("Hello Elysia");
    });
  });
});
