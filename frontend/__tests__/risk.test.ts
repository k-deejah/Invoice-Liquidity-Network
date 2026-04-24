import { describe, expect, it } from "vitest";
import { scoreToRiskLevel, RISK_SORT_ORDER, RiskLevel } from "../utils/risk";

describe("scoreToRiskLevel", () => {
  it("returns Low for score 70–100", () => {
    expect(scoreToRiskLevel(100)).toBe("Low");
    expect(scoreToRiskLevel(70)).toBe("Low");
    expect(scoreToRiskLevel(85)).toBe("Low");
  });

  it("returns Medium for score 40–69", () => {
    expect(scoreToRiskLevel(69)).toBe("Medium");
    expect(scoreToRiskLevel(40)).toBe("Medium");
    expect(scoreToRiskLevel(55)).toBe("Medium");
  });

  it("returns High for score 0–39", () => {
    expect(scoreToRiskLevel(39)).toBe("High");
    expect(scoreToRiskLevel(0)).toBe("High");
    expect(scoreToRiskLevel(20)).toBe("High");
  });

  it("returns Unknown for null", () => {
    expect(scoreToRiskLevel(null)).toBe("Unknown");
  });

  it("returns Unknown for undefined", () => {
    expect(scoreToRiskLevel(undefined)).toBe("Unknown");
  });
});

describe("RISK_SORT_ORDER", () => {
  it("orders Low < Medium < High < Unknown", () => {
    const levels: RiskLevel[] = ["Low", "Medium", "High", "Unknown"];
    const sorted = [...levels].sort(
      (a, b) => RISK_SORT_ORDER[a] - RISK_SORT_ORDER[b]
    );
    expect(sorted).toEqual(["Low", "Medium", "High", "Unknown"]);
  });

  it("allows stable descending sort (Unknown first)", () => {
    const levels: RiskLevel[] = ["Low", "Unknown", "High", "Medium"];
    const sorted = [...levels].sort(
      (a, b) => RISK_SORT_ORDER[b] - RISK_SORT_ORDER[a]
    );
    expect(sorted).toEqual(["Unknown", "High", "Medium", "Low"]);
  });
});
