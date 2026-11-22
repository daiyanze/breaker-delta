import { describe, expect, test } from "bun:test";
import { SettingsSchema } from "@bd/contracts";
import fresh from "../sets/fresh/desk-settings.json" with { type: "json" };

describe("settings defaults (#16)", () => {
  test("the owner's defaults", () => {
    const d = SettingsSchema.parse({});
    expect(d.waveThreshold).toBe(3);
    expect(d.halfLifeHours).toBe(24);
    expect(d.summariesPerRun).toBe(3);
    expect(d.timeZone).toBe("Asia/Tokyo");
    expect(d.mailSendTime).toBe("08:00");
    expect(d.assignProviders).toEqual([]);
    expect(d.summarizeProviders).toEqual([]);
  });

  test("the fresh set, a new install, holds exactly the defaults", () => {
    // contract.test.ts checks the file parses to itself, so this compares the file.
    expect(SettingsSchema.parse(fresh.current)).toEqual(SettingsSchema.parse({}));
  });

  test("the mail send time is HH:MM on a 24-hour clock", () => {
    for (const ok of ["00:00", "08:00", "23:59"]) {
      expect(SettingsSchema.safeParse({ mailSendTime: ok }).success).toBe(true);
    }
    for (const bad of ["8:00", "24:00", "08:60", "08:00:00", "8am"]) {
      expect(SettingsSchema.safeParse({ mailSendTime: bad }).success).toBe(false);
    }
  });

  test("the time zone must be one the runtime knows", () => {
    expect(SettingsSchema.safeParse({ timeZone: "Europe/Paris" }).success).toBe(true);
    expect(SettingsSchema.safeParse({ timeZone: "Mars/Olympus" }).success).toBe(false);
    expect(SettingsSchema.safeParse({ timeZone: "" }).success).toBe(false);
  });
});
