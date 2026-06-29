import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { createDb, createPgPool } from "../db/client";
import { users } from "../db/schema";

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

async function readSecret(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const onData = (chunk: Buffer) => {
      const char = chunk.toString("utf8");

      if (char === "\u0003") {
        cleanup();
        reject(new Error("Interrupted"));
        return;
      }

      if (char === "\r" || char === "\n") {
        process.stdout.write("\n");
        cleanup();
        resolve(value);
        return;
      }

      if (char === "\u007f") {
        value = value.slice(0, -1);
        return;
      }

      value += char;
    };

    const cleanup = () => {
      stdin.off("data", onData);
      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }
      stdin.pause();
    };

    let value = "";
    process.stdout.write(prompt);
    stdin.resume();
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.on("data", onData);
  });
}

async function main() {
  const email = getArg("--email");
  const displayName = getArg("--name");

  if (!email) {
    throw new Error("Usage: npm run user:create -- --email user@example.com");
  }

  const password = await readSecret("Password: ");
  if (password.length < 12) {
    throw new Error("Password must be at least 12 characters");
  }

  const pool = createPgPool();
  const db = createDb(pool);
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email)
  });

  if (existing) {
    await pool.end();
    throw new Error(`User ${email} already exists`);
  }

  await db.insert(users).values({
    email,
    displayName,
    passwordHash: await argon2.hash(password, {
      type: argon2.argon2id
    })
  });

  await pool.end();
  console.log(`Created user ${email}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
