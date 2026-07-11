import { describe, expect, test } from "bun:test";
import { parseCustomerWeddingUpdate } from "@/lib/weddings/customer-update";

describe("customer wedding page updates", () => {
  test("accepts only the guest message and upload lock", () => {
    expect(
      parseCustomerWeddingUpdate({
        welcomeNote: "We cannot wait to celebrate with you.",
        uploadLocked: true,
      }),
    ).toEqual({
      welcomeNote: "We cannot wait to celebrate with you.",
      uploadLocked: true,
    });
  });

  test("rejects customer attempts to change names or the wedding date", () => {
    expect(() =>
      parseCustomerWeddingUpdate({ brideName: "Another", welcomeNote: "Hello" }),
    ).toThrow("Only the owner can change names and the wedding date.");
    expect(() => parseCustomerWeddingUpdate({ eventDate: "2030-01-01" })).toThrow(
      "Only the owner can change names and the wedding date.",
    );
  });

  test("rejects unknown fields and invalid value types", () => {
    expect(() => parseCustomerWeddingUpdate({ storageQuotaBytes: 0 })).toThrow(
      "Unsupported wedding page field.",
    );
    expect(() => parseCustomerWeddingUpdate({ uploadLocked: "yes" })).toThrow(
      "Upload lock must be true or false.",
    );
  });
});
