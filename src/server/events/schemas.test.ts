import { EventType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { validateEventPayload } from "./schemas";

describe("validateEventPayload", () => {
  it("rejects invalid payload shape for REPLAN_REQUESTED", () => {
    expect(() =>
      validateEventPayload(EventType.REPLAN_REQUESTED, {
        triggeredBy: "operator",
        reason: "",
      }),
    ).toThrowError();
  });

  it("accepts valid payload shape for TICKET_UPDATED", () => {
    const payload = validateEventPayload(EventType.TICKET_UPDATED, {
      fieldsChanged: ["status"],
      summary: "Moved ticket to in progress.",
    });

    expect(payload.fieldsChanged).toEqual(["status"]);
  });
});
