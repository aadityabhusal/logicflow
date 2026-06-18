import { describe, expect, it } from "vitest";
import { getDocsUrl } from "./docs-registry";

describe("getDocsUrl", () => {
  it("returns undefined for missing source or operation name", () => {
    expect(getDocsUrl(undefined, "eq")).toBeUndefined();
    expect(getDocsUrl({ name: "supabaseBuilder" }, undefined)).toBeUndefined();
  });

  it("returns undefined for unknown source", () => {
    expect(getDocsUrl({ name: "unknown" }, "eq")).toBeUndefined();
  });

  it("generates modifier URLs for supabaseBuilder", () => {
    expect(getDocsUrl({ name: "supabaseBuilder" }, "limit")).toBe(
      "https://supabase.com/docs/reference/javascript/using-modifiers-limit"
    );
    expect(getDocsUrl({ name: "supabaseBuilder" }, "maybeSingle")).toBe(
      "https://supabase.com/docs/reference/javascript/using-modifiers-maybesingle"
    );
  });

  it("generates filter URLs for supabaseBuilder", () => {
    expect(getDocsUrl({ name: "supabaseBuilder" }, "eq")).toBe(
      "https://supabase.com/docs/reference/javascript/using-filters-eq"
    );
    expect(getDocsUrl({ name: "supabaseBuilder" }, "contains")).toBe(
      "https://supabase.com/docs/reference/javascript/using-filters-contains"
    );
  });

  it("generates standard URL for non-filter non-modifier operations", () => {
    expect(getDocsUrl({ name: "supabaseBuilder" }, "isDistinct")).toBe(
      "https://supabase.com/docs/reference/javascript/isdistinct"
    );
  });

  it("generates standard URLs for other supabase sources", () => {
    expect(getDocsUrl({ name: "supabaseClient" }, "from")).toBe(
      "https://supabase.com/docs/reference/javascript/from"
    );
    expect(getDocsUrl({ name: "supabaseQueryBuilder" }, "select")).toBe(
      "https://supabase.com/docs/reference/javascript/select"
    );
    expect(getDocsUrl({ name: "supabaseFunctions" }, "invoke")).toBe(
      "https://supabase.com/docs/reference/javascript/invoke"
    );
  });

  it.each([
    ["remeda", "remeda.pipe", "https://remedajs.com/docs#pipe"],
    [
      "wretch",
      "wretch.get",
      "https://elbywan.github.io/wretch/api/interfaces/index.Wretch.html#get",
    ],
    [
      "wretchResponseChain",
      "wretchResponseChain.json",
      "https://elbywan.github.io/wretch/api/interfaces/index.WretchResponseChain.html#json",
    ],
    [
      "rowguard",
      "rowguard.createPolicy",
      "https://supabase-community.github.io/rowguard/modules.html#createpolicy",
    ],
  ])("strips package prefixes for %s docs", (source, operation, expected) => {
    expect(getDocsUrl({ name: source }, operation)).toBe(expected);
  });

  it.each([
    [
      "faker",
      "faker.person.firstName",
      "https://fakerjs.dev/api/person.html#firstname",
    ],
    [
      "dateFns",
      "dateFns.startOfMonth",
      "https://date-fns.org/v4.1.0/docs/startOfMonth",
    ],
    [
      "ffmpeg",
      "ffmpeg.toCommand",
      "https://github.com/aadityabhusal/logicflow/blob/main/docs/ffmpeg-package.md#toCommand",
    ],
  ])("uses raw operation names for %s docs", (source, operation, expected) => {
    expect(getDocsUrl({ name: source }, operation)).toBe(expected);
  });

  it("strips package prefix from operation name", () => {
    expect(getDocsUrl({ name: "supabaseBuilder" }, "supabase.limit")).toBe(
      "https://supabase.com/docs/reference/javascript/using-modifiers-limit"
    );
    expect(getDocsUrl({ name: "supabaseBuilder" }, "supabase.eq")).toBe(
      "https://supabase.com/docs/reference/javascript/using-filters-eq"
    );
  });
});
