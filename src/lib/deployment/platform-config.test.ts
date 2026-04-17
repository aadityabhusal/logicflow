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

    it("returns empty array for netlify platform (not yet handled)", () => {
      expect(generatePlatformConfig("netlify" as never, ops)).toEqual([]);
    });

    it("returns empty array for supabase platform", () => {
      expect(generatePlatformConfig("supabase", ops)).toEqual([]);
    });

    it("returns empty array for unknown platform", () => {
      expect(generatePlatformConfig("unknown" as never, ops)).toEqual([]);
    });
  });

  describe("Vercel config", () => {
    it("generates valid JSON with version 2", () => {
      const result = generatePlatformConfig("vercel", ops);
      const parsed = JSON.parse(result[0].content);
      expect(parsed.version).toBe(2);
    });

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
