import { describe, expect, it } from "vitest";
import { adjustAnimation, createTimelineAnimation, timelineRange } from "../web/timeline";
describe("timeline editing", () => {
  it("creates a default clip at the clicked position with bounded timing", () => {
    expect(createTimelineAnimation(100, 250, 2500)).toEqual({type:"fade",delay:1000,duration:600});
    expect(createTimelineAnimation(-10, 250, 2500).delay).toBe(0);
    expect(createTimelineAnimation(250, 250, 2500).delay).toBe(2500);
    expect(createTimelineAnimation(250, 250, 20000).delay).toBe(10000);
    expect(createTimelineAnimation(50, 0, 2500).delay).toBe(0);
  });
  it("moves clips without changing duration", () => {
    expect(adjustAnimation(100, 600, 230, "move", 2500)).toEqual([330,600]);
    expect(adjustAnimation(100, 600, -500, "move", 2500)).toEqual([0,600]);
  });
  it("resizes from either edge without negative timing", () => {
    expect(adjustAnimation(100,600,200,"end",2500)).toEqual([100,800]);
    expect(adjustAnimation(100,600,200,"start",2500)).toEqual([300,400]);
    expect(adjustAnimation(100,600,900,"start",2500)).toEqual([700,0]);
  });
  it("extends the ruler to cover long clips", () => {
    expect(timelineRange([{type:"fade",delay:9000,duration:5000}])).toBeGreaterThan(14000);
  });
});
