export type CustomerWeddingUpdate = {
  welcomeNote?: string;
  uploadLocked?: boolean;
};

const CUSTOMER_FIELDS = new Set(["welcomeNote", "uploadLocked"]);
const OWNER_ONLY_FIELDS = new Set(["brideName", "groomName", "eventDate", "timezone", "slug"]);

export function parseCustomerWeddingUpdate(value: unknown): CustomerWeddingUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Wedding page changes must be an object.");
  }

  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);

  if (keys.some((key) => OWNER_ONLY_FIELDS.has(key))) {
    throw new Error("Only the owner can change names and the wedding date.");
  }

  if (keys.some((key) => !CUSTOMER_FIELDS.has(key))) {
    throw new Error("Unsupported wedding page field.");
  }

  if (keys.length === 0) {
    throw new Error("No wedding page changes were provided.");
  }

  const patch: CustomerWeddingUpdate = {};

  if ("welcomeNote" in input) {
    if (typeof input.welcomeNote !== "string") {
      throw new Error("Guest message must be text.");
    }
    patch.welcomeNote = input.welcomeNote;
  }

  if ("uploadLocked" in input) {
    if (typeof input.uploadLocked !== "boolean") {
      throw new Error("Upload lock must be true or false.");
    }
    patch.uploadLocked = input.uploadLocked;
  }

  return patch;
}
