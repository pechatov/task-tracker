import "dotenv/config";
import { z } from "zod";

const intFromString = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value == null || value === "") {
        return defaultValue;
      }

      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Expected integer env value, received ${value}`);
      }

      return parsed;
    });

const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    if (value == null || value.trim() === "") {
      return undefined;
    }

    return value;
  });

const envSchema = z.object({
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  APP_ENCRYPTION_KEY: z.string().min(1),
  APP_ENCRYPTION_KEY_ID: z.string().min(1).default("local-dev"),
  AUTH_SESSION_SECRET: z.string().min(32),
  CALENDAR_SYNC_PAST_DAYS: intFromString(365),
  CALENDAR_SYNC_FUTURE_DAYS: intFromString(90),
  CALENDAR_SYNC_POLL_SECONDS: intFromString(600),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  MICROSOFT_CLIENT_ID: optionalString,
  MICROSOFT_CLIENT_SECRET: optionalString,
  MICROSOFT_TENANT_ID: z.string().optional().default("common"),
  LOCAL_CALENDAR_IMPORT_TOKEN: optionalString,
  LOCAL_CALENDAR_IMPORT_USER_EMAIL: optionalString
});

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(): AppEnv {
  return envSchema.parse(process.env);
}
