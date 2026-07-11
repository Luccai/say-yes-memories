import {
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";

export const CUSTOMER_PASSWORD_MIN_LENGTH = 10;
export const OWNER_PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

const SCRYPT_VERSION = "scrypt-v1";
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const SALT_LENGTH = 16;
const MINIMUM_PEPPER_LENGTH = 32;

type PasswordPolicy = "customer" | "owner";

function passwordMinimum(policy: PasswordPolicy) {
  return policy === "owner"
    ? OWNER_PASSWORD_MIN_LENGTH
    : CUSTOMER_PASSWORD_MIN_LENGTH;
}

export function validatePassword(password: string, policy: PasswordPolicy) {
  const minimum = passwordMinimum(policy);

  if (password.length < minimum) {
    return {
      ok: false as const,
      message: `Password must be at least ${minimum} characters.`,
    };
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false as const,
      message: `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { ok: true as const };
}

function resolvePepper(override?: string) {
  const pepper = override ?? process.env.AUTH_PASSWORD_PEPPER;

  if (!pepper || Buffer.byteLength(pepper, "utf8") < MINIMUM_PEPPER_LENGTH) {
    throw new Error("AUTH_PASSWORD_PEPPER must contain at least 32 bytes.");
  }

  return pepper;
}

function pepperedPassword(password: string, pepper: string) {
  return createHmac("sha256", pepper).update(password, "utf8").digest();
}

function deriveKey(password: Buffer, salt: Buffer, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      { N: n, r, p, maxmem: SCRYPT_MAX_MEMORY },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string, pepperOverride?: string) {
  if (!password || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error("Password cannot be empty or exceed the maximum length.");
  }

  const pepper = resolvePepper(pepperOverride);
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await deriveKey(
    pepperedPassword(password, pepper),
    salt,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
  );

  return [
    SCRYPT_VERSION,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  pepperOverride?: string,
) {
  try {
    if (!password || password.length > PASSWORD_MAX_LENGTH) {
      return false;
    }

    const [version, rawN, rawR, rawP, rawSalt, rawExpectedKey, extra] =
      storedHash.split("$");
    const n = Number(rawN);
    const r = Number(rawR);
    const p = Number(rawP);

    if (
      extra !== undefined ||
      version !== SCRYPT_VERSION ||
      n !== SCRYPT_N ||
      r !== SCRYPT_R ||
      p !== SCRYPT_P ||
      !rawSalt ||
      !rawExpectedKey
    ) {
      return false;
    }

    const salt = Buffer.from(rawSalt, "base64url");
    const expectedKey = Buffer.from(rawExpectedKey, "base64url");
    if (salt.length !== SALT_LENGTH || expectedKey.length !== SCRYPT_KEY_LENGTH) {
      return false;
    }

    const pepper = resolvePepper(pepperOverride);
    const actualKey = await deriveKey(
      pepperedPassword(password, pepper),
      salt,
      n,
      r,
      p,
    );

    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}
