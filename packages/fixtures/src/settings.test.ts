import { describe, expect, test } from "bun:test";
import { SettingsSchema } from "@bd/contracts";
import fresh from "../sets/fresh/desk-settings.json" with { type: "json" };

describe("settings defaults (#16)", () => {
  test("the owner's defaults", () => {
    const d = SettingsSchema.parse({});
    expect(d.waveThreshold).toBe(3);
    expect(d.halfLifeHours).toBe(24);
    // Wave height (#28): these keep the scaffold's formula until the owner chooses.
    expect(d.heightScale).toBe(10);
    expect(d.sourceBonus).toBe(0.5);
    expect(d.maxEchoesPerGroup).toBe(0);
    expect(d.heatNormalisation).toBe("none");
    expect(d.heatReferencePercentile).toBe(90);
    expect(d.summariesPerRun).toBe(3);
    expect(d.reviewWindowDays).toBe(14);
    // The owner, 2026-11-28 (#303).
    expect(d.tideMinWaves).toBe(2);
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

  test("the time zone has the shape of an IANA name and the runtime knows it", () => {
    for (const ok of ["Asia/Tokyo", "Europe/Paris", "America/Argentina/Buenos_Aires", "UTC"]) {
      expect(SettingsSchema.safeParse({ timeZone: ok }).success).toBe(true);
    }
    // Some runtimes accept these; refusing them everywhere keeps Bun and V8 alike.
    for (const bad of ["Mars/Olympus", "", "JST", "+09:00", "asia/tokyo", "Etc/GMT+9x"]) {
      expect(SettingsSchema.safeParse({ timeZone: bad }).success).toBe(false);
    }
  });
});
