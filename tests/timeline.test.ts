import { describe, expect, it } from "vitest";
import { adjustAnimation, timelineRange } from "../web/timeline";
describe("timeline editing", () => {
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
