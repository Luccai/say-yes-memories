import { describe, expect, test } from "bun:test";
import {
  dialogKeyboardIntent,
  resolveFocusTrapTarget,
} from "@/lib/use-accessible-dialog";

describe("accessible dialog keyboard behavior", () => {
  test("maps Escape and Tab keys to explicit dialog actions", () => {
    expect(dialogKeyboardIntent("Escape", false)).toBe("close");
    expect(dialogKeyboardIntent("Tab", false)).toBe("trap-forward");
    expect(dialogKeyboardIntent("Tab", true)).toBe("trap-backward");
    expect(dialogKeyboardIntent("Enter", false)).toBeNull();
  });

  test("wraps focus from the last control to the first control", () => {
    const controls = ["close", "secondary", "primary"] as const;

    expect(resolveFocusTrapTarget(controls, "primary", false)).toBe("close");
    expect(resolveFocusTrapTarget(controls, "secondary", false)).toBeNull();
  });

  test("wraps backward and recovers focus that escaped the dialog", () => {
    const controls = ["close", "primary"] as const;

    expect(resolveFocusTrapTarget(controls, "close", true)).toBe("primary");
    expect(resolveFocusTrapTarget(controls, null, false)).toBe("close");
    expect(resolveFocusTrapTarget(controls, null, true)).toBe("primary");
    expect(resolveFocusTrapTarget([], null, false)).toBeNull();
  });
});
