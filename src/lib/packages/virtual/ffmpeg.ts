export interface FfmpegCommand {
  _tokens: string[];
  _executable: string;
}

function shellQuote(arg: string): string {
  if (arg === "") return "''";
  if (!/[^a-zA-Z0-9_\-.\\/:,@+=%^]/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function command(): FfmpegCommand {
  return { _tokens: [], _executable: "ffmpeg" };
}

export function executable(cmd: FfmpegCommand, name: string): FfmpegCommand {
  return { ...cmd, _executable: name };
}

export function input(cmd: FfmpegCommand, path: string): FfmpegCommand {
  return {
    ...cmd,
    _tokens: [...cmd._tokens, "-i", path],
  };
}

export function option(cmd: FfmpegCommand, flag: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, flag] };
}

export function optionValue(
  cmd: FfmpegCommand,
  flag: string,
  value: string
): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, flag, value] };
}

export function raw(cmd: FfmpegCommand, tokens: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, tokens] };
}

export function inputOption(cmd: FfmpegCommand, flag: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, flag] };
}

export function inputOptionValue(
  cmd: FfmpegCommand,
  flag: string,
  value: string
): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, flag, value] };
}

export function output(cmd: FfmpegCommand, path: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, path] };
}

export function outputOption(cmd: FfmpegCommand, flag: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, flag] };
}

export function outputOptionValue(
  cmd: FfmpegCommand,
  flag: string,
  value: string
): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, flag, value] };
}

export function map(cmd: FfmpegCommand, selector: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-map", selector] };
}

export function videoCodec(cmd: FfmpegCommand, codec: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-c:v", codec] };
}

export function audioCodec(cmd: FfmpegCommand, codec: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-c:a", codec] };
}

export function subtitleCodec(
  cmd: FfmpegCommand,
  codec: string
): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-c:s", codec] };
}

export function videoBitrate(
  cmd: FfmpegCommand,
  bitrate: string
): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-b:v", bitrate] };
}

export function audioBitrate(
  cmd: FfmpegCommand,
  bitrate: string
): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-b:a", bitrate] };
}

export function videoFilter(cmd: FfmpegCommand, filter: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-vf", filter] };
}

export function audioFilter(cmd: FfmpegCommand, filter: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-af", filter] };
}

export function filterComplex(
  cmd: FfmpegCommand,
  filter: string
): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-filter_complex", filter] };
}

export function resolution(
  cmd: FfmpegCommand,
  width: number,
  height: number
): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-s", `${width}x${height}`] };
}

export function frameRate(cmd: FfmpegCommand, fps: number): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-r", String(fps)] };
}

export function pixelFormat(cmd: FfmpegCommand, format: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-pix_fmt", format] };
}

export function audioSampleRate(
  cmd: FfmpegCommand,
  rate: number
): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-ar", String(rate)] };
}

export function audioChannels(
  cmd: FfmpegCommand,
  count: number
): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-ac", String(count)] };
}

export function format(cmd: FfmpegCommand, fmt: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-f", fmt] };
}

export function overwrite(cmd: FfmpegCommand): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-y"] };
}

export function noOverwrite(cmd: FfmpegCommand): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-n"] };
}

export function hideBanner(cmd: FfmpegCommand): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-hide_banner"] };
}

export function logLevel(cmd: FfmpegCommand, level: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-loglevel", level] };
}

export function threads(cmd: FfmpegCommand, count: number): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-threads", String(count)] };
}

export function duration(cmd: FfmpegCommand, d: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-t", d] };
}

export function startTime(cmd: FfmpegCommand, time: string): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-ss", time] };
}

export function disableVideo(cmd: FfmpegCommand): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-vn"] };
}

export function disableAudio(cmd: FfmpegCommand): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-an"] };
}

export function disableSubtitles(cmd: FfmpegCommand): FfmpegCommand {
  return { ...cmd, _tokens: [...cmd._tokens, "-sn"] };
}

export function conform(
  cmd: FfmpegCommand,
  options: Record<string, unknown>
): FfmpegCommand {
  const tokens = [...cmd._tokens];
  for (const [key, value] of Object.entries(options)) {
    tokens.push(`-${key}`);
    if (value !== null && value !== undefined && value !== true) {
      tokens.push(String(value));
    }
  }
  return { ...cmd, _tokens: tokens };
}

export function toArgs(cmd: FfmpegCommand): string[] {
  return [cmd._executable, ...cmd._tokens];
}

export function toCommand(cmd: FfmpegCommand): string {
  return [cmd._executable, ...cmd._tokens].map(shellQuote).join(" ");
}
