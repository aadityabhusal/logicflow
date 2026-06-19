import { describe, it, expect } from "vitest";
import { generatePlatformConfig } from "@/lib/deployment/platform-config";
import { createTriggeredOperationFile } from "@/tests/helpers";

describe("generatePlatformConfig", () => {
  const ops = [
    createTriggeredOperationFile("getUser"),
    createTriggeredOperationFile("createUser"),
  ];

  describe("dispatch", () => {
    it("returns Vercel config for vercel platform", () => {
      const result = generatePlatformConfig("vercel", ops);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].filename).toBe("vercel.json");
    });

    it.each(["netlify", "supabase", "unknown"] as const)(
      "returns empty array for unsupported %s platform",
      (platform) => {
        expect(generatePlatformConfig(platform as never, ops)).toEqual([]);
      }
    );
  });

  describe("Vercel config", () => {
    it("creates exact route structure for multiple operations", () => {
      const result = generatePlatformConfig("vercel", ops);
      const parsed = JSON.parse(result[0].content);

      expect(parsed).toEqual({
        version: 2,
        routes: [
          { src: "/api/getUser", dest: "/api/getUser" },
          { src: "/api/createUser", dest: "/api/createUser" },
        ],
      });
    });

    it("generates single route for single operation", () => {
      const result = generatePlatformConfig("vercel", [
        createTriggeredOperationFile("hello"),
      ]);
      const parsed = JSON.parse(result[0].content);

      expect(parsed).toEqual({
        version: 2,
        routes: [{ src: "/api/hello", dest: "/api/hello" }],
      });
    });

    it("generates valid vercel.json with empty routes when no triggered operations", () => {
      const result = generatePlatformConfig("vercel", []);
      expect(result).toHaveLength(1);

      const parsed = JSON.parse(result[0].content);
      expect(parsed).toEqual({ version: 2, routes: [] });
    });
  });
});
