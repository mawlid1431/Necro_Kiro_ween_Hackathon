// MCP posting helpers: time zones, schedule parsing, overall status, edit/cancel rules, configurable limits.
import { afterEach, describe, expect, it } from "vitest";
import { parseScheduleAt, zoned } from "../../lib/social/time";
import { editableError, overallStatus } from "../../lib/social/postStatus";
import { mcpWriteLimits } from "../../lib/limits";
import { decodeBase64Image, imageDamage } from "../../lib/social/imageBytes";

describe("time zones", () => {
  it("shows one instant in UTC and in Singapore time", () => {
    const ms = Date.parse("2026-11-26T01:00:00Z");
    expect(zoned(ms)).toEqual({
      utc: "2026-11-26T01:00:00.000Z",
      singapore: "2026-11-26T09:00:00+08:00",
      label: "Thu 26 Nov 2026, 09:00 SGT",
      timeZone: "Asia/Singapore",
    });
    // Crossing midnight: 20:30 UTC is 04:30 the next day in Singapore.
    expect(zoned(Date.parse("2026-12-31T20:30:00Z")).singapore).toBe("2027-01-01T04:30:00+08:00");
  });

  it("parses times with a zone, to the minute, and refuses times without one", () => {
    expect(parseScheduleAt("2026-11-26T09:00:00+08:00")).toEqual({ ok: true, ms: Date.parse("2026-11-26T01:00:00Z") });
    expect(parseScheduleAt("2026-11-26T09:07+08:00")).toEqual({ ok: true, ms: Date.parse("2026-11-26T01:07:00Z") });
    expect(parseScheduleAt("2026-11-26T01:00:00.000Z")).toEqual({ ok: true, ms: Date.parse("2026-11-26T01:00:00Z") });
    expect(parseScheduleAt("2026-11-26T09:00:00+0800").ok).toBe(true);
    for (const bad of ["2026-11-26T09:00:00", "tomorrow 9am", "2026-11-26", "", "2026-13-40T09:00:00Z"]) {
      expect(parseScheduleAt(bad).ok).toBe(false);
    }
  });
});

describe("overall status of a post (one row per platform)", () => {
  it("follows the most urgent row", () => {
    expect(overallStatus(["scheduled", "scheduled"])).toBe("scheduled");
    expect(overallStatus(["posting", "posted"])).toBe("posting");
    expect(overallStatus(["posted", "due"])).toBe("due");
    expect(overallStatus(["posted", "failed"])).toBe("partly_posted");
    expect(overallStatus(["failed", "canceled"])).toBe("failed");
    expect(overallStatus(["posted"])).toBe("posted");
    expect(overallStatus(["canceled", "canceled"])).toBe("canceled");
  });

  it("allows edits only while scheduled; cancel also for a due reminder; never after it went out", () => {
    expect(editableError(["scheduled", "canceled"], "edit")).toBeNull();
    expect(editableError(["scheduled", "due"], "edit")).toMatch(/already due/);
    expect(editableError(["posting"], "edit")).toMatch(/being posted right now/);
    expect(editableError(["posted"], "edit")).toMatch(/already posted.*can't be edited/);
    expect(editableError(["failed"], "cancel")).toMatch(/already failed.*can't be cancelled/);
    expect(editableError(["due"], "cancel")).toBeNull();
    expect(editableError(["canceled"], "cancel")).toMatch(/already cancelled/);
  });
});

describe("configurable MCP write limits", () => {
  afterEach(() => {
    delete process.env.MCP_POSTS_PER_DAY;
    delete process.env.MCP_WRITE_CALLS_PER_HOUR;
  });
  it("defaults to 20 posts a day and 60 write calls an hour, and reads overrides at call time", () => {
    expect(mcpWriteLimits()).toEqual({ postsPerDay: 20, writeCallsPerHour: 60 });
    process.env.MCP_POSTS_PER_DAY = "5";
    process.env.MCP_WRITE_CALLS_PER_HOUR = "nonsense";
    expect(mcpWriteLimits()).toEqual({ postsPerDay: 5, writeCallsPerHour: 60 });
  });
});

describe("images damaged on the way (base64 typed out by a chat assistant)", () => {
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const png = () => decodeBase64Image(PNG)!;

  it("a whole PNG passes", () => {
    expect(imageDamage(png(), "image/png")).toBeNull();
  });

  it("one changed byte anywhere in the data is caught by the chunk checksum", () => {
    for (const at of [20, 40, 50]) {
      const b = png();
      b[at] ^= 0x01;
      expect(imageDamage(b, "image/png"), `byte ${at}`).toMatch(/checksum mismatch|cut short/);
    }
  });

  it("a cut-off PNG or JPEG is caught", () => {
    expect(imageDamage(png().slice(0, 40), "image/png")).toMatch(/cut short/);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    expect(imageDamage(jpeg, "image/jpeg")).toBeNull();
    expect(imageDamage(jpeg.slice(0, 7), "image/jpeg")).toMatch(/cut short/);
  });
});
