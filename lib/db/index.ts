import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Prevent multiple connections in dev (hot reload)
const globalForDb = globalThis as unknown as {
  pgClient: postgres.Sql | undefined;
};

const client =
  globalForDb.pgClient ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 10 : 2,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
export type DB = typeof db;
