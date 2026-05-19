import { describe, it, expect, beforeAll } from "vitest";
import { executeOperation } from "@/lib/execution/execution";
import { operations as ffmpegOperations } from "@/lib/operations/ffmpeg";
import { createData, getRawValueFromData, isDataOfType } from "@/lib/utils";
import { OperationListItem } from "@/lib/execution/types";
import { createTestContext, stringStatement } from "@/tests/helpers";
import { syncPackageRegistry } from "@/lib/operations/built-in";

describe("ffmpeg operations", () => {
  beforeAll(async () => {
    await syncPackageRegistry([{ name: "ffmpeg" }]);
  });

  function findOp(name: string): OperationListItem {
    const op = ffmpegOperations.find((o) => o.name === name);
    if (!op) throw new Error(`ffmpeg operation "${name}" not found`);
    return op;
  }

  it("command creates an ffmpeg.Command instance", async () => {
    const ctx = createTestContext();
    const op = findOp("command");
    const result = await executeOperation(op, createData(), [], ctx);

    expect(isDataOfType(result, "instance")).toBe(true);
    if (result.type.kind === "instance") {
      expect(result.type.className).toBe("ffmpeg.Command");
    }
  });

  it("input adds -i flag before path", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const inputOp = findOp("input");

    const cmd = await executeOperation(cmdOp, createData(), [], ctx);
    const result = await executeOperation(
      inputOp,
      cmd,
      [stringStatement("video.mp4")],
      ctx
    );

    expect(isDataOfType(result, "instance")).toBe(true);
    const raw = getRawValueFromData(result, ctx) as {
      _tokens: string[];
      _executable: string;
    };
    expect(raw._tokens).toEqual(["-i", "video.mp4"]);
  });

  it("output adds path without flag", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const outputOp = findOp("output");

    const cmd = await executeOperation(cmdOp, createData(), [], ctx);
    const result = await executeOperation(
      outputOp,
      cmd,
      [stringStatement("output.mp4")],
      ctx
    );

    const raw = getRawValueFromData(result, ctx) as {
      _tokens: string[];
    };
    expect(raw._tokens).toEqual(["output.mp4"]);
  });

  it("option adds a flag", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const optionOp = findOp("option");

    const cmd = await executeOperation(cmdOp, createData(), [], ctx);
    const result = await executeOperation(
      optionOp,
      cmd,
      [stringStatement("-y")],
      ctx
    );

    const raw = getRawValueFromData(result, ctx) as {
      _tokens: string[];
    };
    expect(raw._tokens).toEqual(["-y"]);
  });

  it("optionValue adds flag and value", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const optionOp = findOp("optionValue");

    const cmd = await executeOperation(cmdOp, createData(), [], ctx);
    const result = await executeOperation(
      optionOp,
      cmd,
      [stringStatement("-c:v"), stringStatement("libx264")],
      ctx
    );

    const raw = getRawValueFromData(result, ctx) as {
      _tokens: string[];
    };
    expect(raw._tokens).toEqual(["-c:v", "libx264"]);
  });

  it("preserves token order through a full chain", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const overwriteOp = findOp("overwrite");
    const inputOp = findOp("input");
    const videoCodecOp = findOp("videoCodec");
    const outputOp = findOp("output");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(overwriteOp, result, [], ctx);
    result = await executeOperation(
      inputOp,
      result,
      [stringStatement("in.mkv")],
      ctx
    );
    result = await executeOperation(
      videoCodecOp,
      result,
      [stringStatement("libx264")],
      ctx
    );
    result = await executeOperation(
      outputOp,
      result,
      [stringStatement("out.mp4")],
      ctx
    );

    const raw = getRawValueFromData(result, ctx) as {
      _tokens: string[];
    };
    expect(raw._tokens).toEqual([
      "-y",
      "-i",
      "in.mkv",
      "-c:v",
      "libx264",
      "out.mp4",
    ]);
  });

  it("toCommand returns a shell-safe command string", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const inputOp = findOp("input");
    const outputOp = findOp("output");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(
      inputOp,
      result,
      [stringStatement("input.mp4")],
      ctx
    );
    result = await executeOperation(
      outputOp,
      result,
      [stringStatement("output.mp4")],
      ctx
    );
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(isDataOfType(result, "string")).toBe(true);
    expect(getRawValueFromData(result, ctx)).toBe(
      "ffmpeg -i input.mp4 output.mp4"
    );
  });

  it("toArgs returns token array", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const inputOp = findOp("input");
    const toArgsOp = findOp("toArgs");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(
      inputOp,
      result,
      [stringStatement("video.mp4")],
      ctx
    );
    result = await executeOperation(toArgsOp, result, [], ctx);

    expect(isDataOfType(result, "array")).toBe(true);
    const raw = getRawValueFromData(result, ctx) as string[];
    expect(raw).toEqual(["ffmpeg", "-i", "video.mp4"]);
  });

  it("shell-quotes paths with spaces in toCommand", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const inputOp = findOp("input");
    const outputOp = findOp("output");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(
      inputOp,
      result,
      [stringStatement("my video.mp4")],
      ctx
    );
    result = await executeOperation(
      outputOp,
      result,
      [stringStatement("out file.mp4")],
      ctx
    );
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe(
      "ffmpeg -i 'my video.mp4' 'out file.mp4'"
    );
  });

  it("videoCodec sets -c:v", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const videoCodecOp = findOp("videoCodec");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(
      videoCodecOp,
      result,
      [stringStatement("libx265")],
      ctx
    );
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -c:v libx265");
  });

  it("audioCodec sets -c:a", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const audioCodecOp = findOp("audioCodec");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(
      audioCodecOp,
      result,
      [stringStatement("aac")],
      ctx
    );
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -c:a aac");
  });

  it("overwrite adds -y flag", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const overwriteOp = findOp("overwrite");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(overwriteOp, result, [], ctx);
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -y");
  });

  it("noOverwrite adds -n flag", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const noOverwriteOp = findOp("noOverwrite");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(noOverwriteOp, result, [], ctx);
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -n");
  });

  it("hideBanner adds -hide_banner flag", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const hideBannerOp = findOp("hideBanner");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(hideBannerOp, result, [], ctx);
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -hide_banner");
  });

  it("map adds -map selector", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const mapOp = findOp("map");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(
      mapOp,
      result,
      [stringStatement("0:v")],
      ctx
    );
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -map 0:v");
  });

  it("resolution with width and height", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const resOp = findOp("resolution");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(
      resOp,
      result,
      [
        { data: createData({ value: 1280 }), id: "w", operations: [] },
        { data: createData({ value: 720 }), id: "h", operations: [] },
      ],
      ctx
    );
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -s 1280x720");
  });

  it("frameRate sets -r", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const frameRateOp = findOp("frameRate");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(
      frameRateOp,
      result,
      [{ data: createData({ value: 30 }), id: "fps", operations: [] }],
      ctx
    );

    const raw = getRawValueFromData(result, ctx) as {
      _tokens: string[];
    };
    expect(raw._tokens).toEqual(["-r", "30"]);
  });

  it("pixelFormat sets -pix_fmt", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const pixFmtOp = findOp("pixelFormat");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(
      pixFmtOp,
      result,
      [stringStatement("yuv420p")],
      ctx
    );
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -pix_fmt yuv420p");
  });

  it("videoFilter sets -vf", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const vfOp = findOp("videoFilter");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(
      vfOp,
      result,
      [stringStatement("scale=1280:720")],
      ctx
    );
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -vf scale=1280:720");
  });

  it("audioFilter sets -af", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const afOp = findOp("audioFilter");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(
      afOp,
      result,
      [stringStatement("volume=0.5")],
      ctx
    );
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -af volume=0.5");
  });

  it("filterComplex sets -filter_complex", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const fcOp = findOp("filterComplex");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(
      fcOp,
      result,
      [stringStatement("[0:v]scale=1280:720[v]")],
      ctx
    );
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe(
      "ffmpeg -filter_complex '[0:v]scale=1280:720[v]'"
    );
  });

  it("disableVideo adds -vn", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const dvOp = findOp("disableVideo");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(dvOp, result, [], ctx);
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -vn");
  });

  it("disableAudio adds -an", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const daOp = findOp("disableAudio");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(daOp, result, [], ctx);
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -an");
  });

  it("disableSubtitles adds -sn", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const dsOp = findOp("disableSubtitles");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(dsOp, result, [], ctx);
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -sn");
  });

  it("logLevel sets -loglevel with value", async () => {
    const ctx = createTestContext();
    const cmdOp = findOp("command");
    const llOp = findOp("logLevel");
    const toCommandOp = findOp("toCommand");

    let result = await executeOperation(cmdOp, createData(), [], ctx);
    result = await executeOperation(
      llOp,
      result,
      [stringStatement("debug")],
      ctx
    );
    result = await executeOperation(toCommandOp, result, [], ctx);

    expect(getRawValueFromData(result, ctx)).toBe("ffmpeg -loglevel debug");
  });

  it("tag: instance type operations list all ffmpeg ops correctly", async () => {
    expect(ffmpegOperations.length).toBeGreaterThan(30);

    for (const op of ffmpegOperations) {
      expect(op.name).toBeDefined();
      expect(op.name.length).toBeGreaterThan(0);
      expect("handler" in op || "lazyHandler" in op).toBe(true);
    }
  });
});
