import { getEnv } from "../env";
import {
  decryptSecret,
  encryptSecret,
  readEncryptionKeyFromBase64,
  type EncryptedSecret
} from "../security/credentials";

export type GoogleCalendarCredentials = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
};

export type ExchangeCalendarCredentials = {
  password: string;
  serverUrl: string;
  username: string;
};

export type YandexCalendarCredentials = {
  password: string;
  serverUrl: string;
  username: string;
};

export function encryptCalendarCredentials(credentials: unknown) {
  const env = getEnv();
  const secret = encryptSecret(
    JSON.stringify(credentials),
    readEncryptionKeyFromBase64(env.APP_ENCRYPTION_KEY),
    env.APP_ENCRYPTION_KEY_ID
  );

  return {
    encryptedCredentials: JSON.stringify(secret),
    credentialKeyId: secret.keyId
  };
}

export function decryptCalendarCredentials<T>(
  encryptedCredentials: string | null
): T {
  if (!encryptedCredentials) {
    throw new Error("Calendar source credentials are missing");
  }

  const env = getEnv();
  const secret = JSON.parse(encryptedCredentials) as EncryptedSecret;
  const plaintext = decryptSecret(
    secret,
    readEncryptionKeyFromBase64(env.APP_ENCRYPTION_KEY)
  );

  return JSON.parse(plaintext) as T;
}
