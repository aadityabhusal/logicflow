import { IData, DataType } from "@/lib/types";
import {
  getRawValueFromData,
  createDataFromRawValue,
  isObject,
  createRuntimeError,
} from "@/lib/utils";
import { customInstances, InstanceTypeConfig } from "@/lib/packages/registry";
import { Context, OperationListItem } from "../execution/types";
import * as _ffmpeg from "../packages/virtual/ffmpeg";
import type { FfmpegCommand } from "../packages/virtual/ffmpeg";

class FfmpegCommandClass {
  static [Symbol.hasInstance](instance: unknown): boolean {
    return (
      typeof instance === "object" &&
      instance !== null &&
      customInstances.get(instance) === FfmpegCommandClass
    );
  }
}

const FfmpegCommandType: DataType = {
  kind: "instance",
  className: "ffmpeg.Command",
  constructorArgs: [],
};

const TString: DataType = { kind: "string" };
const TNumber: DataType = { kind: "number" };
const TDict: DataType = {
  kind: "dictionary",
  elementType: { kind: "unknown" },
};

type FfmpegLib = typeof _ffmpeg;

function isFfmpegCommand(obj: unknown): obj is FfmpegCommand {
  return (
    isObject(obj) &&
    "_tokens" in obj &&
    Array.isArray((obj as unknown as FfmpegCommand)._tokens) &&
    "_executable" in obj
  );
}

function wrapCommand(cmd: FfmpegCommand, context: Context): IData<DataType> {
  if (!customInstances.has(cmd)) {
    customInstances.set(cmd, FfmpegCommandClass);
  }
  return createDataFromRawValue(cmd, {
    ...context,
    expectedType: FfmpegCommandType,
  });
}

const CHAIN_OPS: { name: string; params: DataType[]; resultType?: DataType }[] =
  [
    { name: "executable", params: [TString] },
    { name: "input", params: [TString] },
    { name: "option", params: [TString] },
    { name: "optionValue", params: [TString, TString] },
    { name: "raw", params: [TString] },
    { name: "inputOption", params: [TString] },
    { name: "inputOptionValue", params: [TString, TString] },
    { name: "output", params: [TString] },
    { name: "outputOption", params: [TString] },
    { name: "outputOptionValue", params: [TString, TString] },
    { name: "map", params: [TString] },
    { name: "videoCodec", params: [TString] },
    { name: "audioCodec", params: [TString] },
    { name: "subtitleCodec", params: [TString] },
    { name: "videoBitrate", params: [TString] },
    { name: "audioBitrate", params: [TString] },
    { name: "videoFilter", params: [TString] },
    { name: "audioFilter", params: [TString] },
    { name: "filterComplex", params: [TString] },
    { name: "resolution", params: [TNumber, TNumber] },
    { name: "frameRate", params: [TNumber] },
    { name: "pixelFormat", params: [TString] },
    { name: "audioSampleRate", params: [TNumber] },
    { name: "audioChannels", params: [TNumber] },
    { name: "format", params: [TString] },
    { name: "overwrite", params: [] },
    { name: "noOverwrite", params: [] },
    { name: "hideBanner", params: [] },
    { name: "logLevel", params: [TString] },
    { name: "threads", params: [TNumber] },
    { name: "duration", params: [TString] },
    { name: "startTime", params: [TString] },
    { name: "disableVideo", params: [] },
    { name: "disableAudio", params: [] },
    { name: "disableSubtitles", params: [] },
    { name: "conform", params: [TDict] },
    {
      name: "toArgs",
      params: [],
      resultType: { kind: "array", elementType: TString },
    },
    { name: "toCommand", params: [], resultType: TString },
  ];

export const operations: OperationListItem[] = [
  {
    name: "command",
    parameters: [],
    shouldCacheResult: true,
    expectedType: FfmpegCommandType,
    source: { name: "ffmpeg", callStyle: "function" },
    handler: (context) => {
      try {
        return wrapCommand(_ffmpeg.command(), context);
      } catch (error) {
        return createRuntimeError(error);
      }
    },
  },

  ...CHAIN_OPS.map(({ name, params, resultType }) => ({
    name,
    parameters: [FfmpegCommandType, ...params].map((type) => ({ type })),
    source: { name: "ffmpeg", callStyle: "function" } as const,
    handler(context: Context, data: IData, ...args: IData[]): IData {
      const cmd = getRawValueFromData(data, context);
      if (!isFfmpegCommand(cmd)) {
        return createRuntimeError("FfmpegCommand instance not found");
      }
      try {
        const result = (
          _ffmpeg[name as keyof FfmpegLib] as (...a: unknown[]) => unknown
        )(cmd, ...args.map((a) => getRawValueFromData(a, context)));
        if (resultType) {
          return createDataFromRawValue(result, {
            ...context,
            expectedType: resultType,
          });
        }
        return wrapCommand(result as FfmpegCommand, context);
      } catch (error) {
        return createRuntimeError(error);
      }
    },
  })),
];

export const instanceTypes: Record<string, InstanceTypeConfig> = {
  "ffmpeg.Command": {
    name: "ffmpeg.Command",
    Constructor: FfmpegCommandClass,
    constructorArgs: [],
    hideFromDropdown: true,
    importInfo: { packageName: "ffmpeg" },
    docsUrl:
      "https://github.com/aadityabhusal/logicflow/blob/main/docs/ffmpeg-package.md",
  },
};

export default { operations, instanceTypes };
