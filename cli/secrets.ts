import fetch from "node-fetch";

type SecretMetadata = {
  name: string;
  created_at: string;
  updated_at: string;
};

type SecretsResponse = {
  secrets?: SecretMetadata[];
  secret?: SecretMetadata;
  deleted?: boolean;
  name?: string;
  error?: string;
};

const [, , command, slug, name] = process.argv;
const apiUrl = process.env.FLOOM_API_URL || "https://floom-60sec.vercel.app";
const token = process.env.FLOOM_TOKEN;

if (!token || !command || !slug || !["list", "set", "delete"].includes(command)) {
  usage();
}

if ((command === "set" || command === "delete") && !name) {
  usage();
}

await main(command, slug, name).catch((error) => {
  console.error(error instanceof Error ? error.message : "Secret command failed");
  process.exit(1);
});

async function main(action: string, appSlug: string, secretName?: string) {
  if (action === "list") {
    const data = await request(`/api/apps/${encodeURIComponent(appSlug)}/secrets`, {
      method: "GET",
    });
    console.log(JSON.stringify({ secrets: data.secrets ?? [] }, null, 2));
    return;
  }

  if (action === "delete" && secretName) {
    const data = await request(`/api/apps/${encodeURIComponent(appSlug)}/secrets`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: secretName }),
    });
    console.log(JSON.stringify({ deleted: data.deleted === true, name: data.name }, null, 2));
    return;
  }

  if (action === "set" && secretName) {
    const value = await readStdin();
    if (!value) {
      throw new Error("Provide the secret value through stdin");
    }

    const data = await request(`/api/apps/${encodeURIComponent(appSlug)}/secrets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: secretName, value }),
    });
    console.log(JSON.stringify({ secret: data.secret }, null, 2));
  }
}

async function request(path: string, init: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({
    error: `Floom returned ${response.status}`,
  }))) as SecretsResponse;

  if (!response.ok) {
    throw new Error(data.error || "Secret command failed");
  }

  return data;
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

function usage(): never {
  console.error([
    "Usage:",
    "  FLOOM_TOKEN=<token> FLOOM_API_URL=<url> tsx cli/secrets.ts list <app-slug>",
    "  printf '%s' \"$VALUE\" | FLOOM_TOKEN=<token> tsx cli/secrets.ts set <app-slug> <SECRET_NAME>",
    "  FLOOM_TOKEN=<token> tsx cli/secrets.ts delete <app-slug> <SECRET_NAME>",
  ].join("\n"));
  process.exit(1);
}
