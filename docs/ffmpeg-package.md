# FFmpeg Command Builder

A small immutable command builder for constructing ffmpeg command lines programmatically.

This package does not execute ffmpeg. It builds either:

- an argument array via `toArgs(cmd)`
- a shell-safe command string via `toCommand(cmd)`

## Pipe Helper

The package functions are not curried. They take the current command as their first argument:

```ts
input(cmd, "video.mp4");
output(cmd, "out.mp4");
```

Examples in this guide use a small `pipe` helper to avoid deeply nested calls. This helper is not part of the package:

```ts
function pipe(value: unknown, ...fns: Array<(value: any) => any>): any {
  return fns.reduce((current, fn) => fn(current), value);
}
```

Because `pipe` accepts any unary function, terminal functions like `toCommand` and `toArgs` can be the final step:

```ts
const commandText = pipe(
  command(),
  (cmd) => input(cmd, "my video.mp4"),
  (cmd) => output(cmd, "out file.mp4"),
  toCommand
);

// ffmpeg -i 'my video.mp4' 'out file.mp4'
```

## Core Concepts

### FfmpegCommand

The command builder value has this shape:

```ts
interface FfmpegCommand {
  _tokens: string[];
  _executable: string;
}
```

Treat this as an opaque value. Create it with `command()` and modify it with the package functions.

### Immutability

Every builder function returns a new `FfmpegCommand`. Existing command values are not mutated.

```ts
const base = pipe(command(), overwrite, (cmd) => input(cmd, "file.mp4"));

const h264 = pipe(
  base,
  (cmd) => videoCodec(cmd, "libx264"),
  (cmd) => output(cmd, "h264.mp4")
);
const h265 = pipe(
  base,
  (cmd) => videoCodec(cmd, "libx265"),
  (cmd) => output(cmd, "h265.mp4")
);

toCommand(h264); // ffmpeg -y -i file.mp4 -c:v libx264 h264.mp4
toCommand(h265); // ffmpeg -y -i file.mp4 -c:v libx265 h265.mp4
```

### Token Order

The builder preserves the exact order in which functions are applied. It does not validate ffmpeg semantics or automatically move options before or after inputs/outputs.

If an ffmpeg option must appear before an input, call it before `input()`. If an option must appear near an output, call it near `output()`.

### Shell Quoting

`toCommand()` shell-quotes arguments that contain spaces or special characters. For process execution, prefer `toArgs()` with `child_process.spawn` when possible.

## API Reference

### command

Creates a new command using `ffmpeg` as the executable.

```ts
const cmd = command();
toCommand(cmd); // ffmpeg
```

### executable

Sets the executable name or path.

```ts
const result = pipe(
  command(),
  (cmd) => executable(cmd, "/usr/local/bin/ffmpeg"),
  toCommand
);

// /usr/local/bin/ffmpeg
```

### input

Adds `-i <path>`.

```ts
pipe(command(), (cmd) => input(cmd, "video.mp4"), toCommand);
// ffmpeg -i video.mp4
```

### output

Adds an output path token.

```ts
pipe(
  command(),
  (cmd) => input(cmd, "in.mp4"),
  (cmd) => output(cmd, "out.mp4"),
  toCommand
);

// ffmpeg -i in.mp4 out.mp4
```

### option

Adds a bare option flag.

```ts
pipe(command(), (cmd) => option(cmd, "-y"), toCommand);
// ffmpeg -y
```

### optionValue

Adds a flag followed by a value.

```ts
pipe(command(), (cmd) => optionValue(cmd, "-preset", "fast"), toCommand);
// ffmpeg -preset fast
```

### raw

Adds one raw token exactly where it appears in the chain.

```ts
pipe(command(), (cmd) => raw(cmd, "--extra-arg"), toCommand);
// ffmpeg --extra-arg
```

### inputOption

Adds an input-related bare option. This is equivalent to `option(cmd, flag)`, but communicates intent.

```ts
pipe(
  command(),
  (cmd) => inputOption(cmd, "-re"),
  (cmd) => input(cmd, "stream.mp4"),
  toCommand
);

// ffmpeg -re -i stream.mp4
```

### inputOptionValue

Adds an input-related option with a value.

```ts
pipe(
  command(),
  (cmd) => inputOptionValue(cmd, "-ss", "10"),
  (cmd) => input(cmd, "video.mp4"),
  toCommand
);

// ffmpeg -ss 10 -i video.mp4
```

### outputOption

Adds an output-related bare option. This is equivalent to `option(cmd, flag)`, but communicates intent.

```ts
pipe(
  command(),
  (cmd) => input(cmd, "in.mp4"),
  (cmd) => output(cmd, "out.mp4"),
  (cmd) => outputOption(cmd, "-shortest"),
  toCommand
);

// ffmpeg -i in.mp4 out.mp4 -shortest
```

### outputOptionValue

Adds an output-related option with a value.

```ts
pipe(
  command(),
  (cmd) => input(cmd, "in.mp4"),
  (cmd) => output(cmd, "out.mp4"),
  (cmd) => outputOptionValue(cmd, "-movflags", "+faststart"),
  toCommand
);

// ffmpeg -i in.mp4 out.mp4 -movflags +faststart
```

### map

Adds `-map <selector>`.

```ts
pipe(
  command(),
  (cmd) => input(cmd, "in.mkv"),
  (cmd) => map(cmd, "0:v"),
  (cmd) => map(cmd, "0:a"),
  (cmd) => output(cmd, "out.mp4"),
  toCommand
);

// ffmpeg -i in.mkv -map 0:v -map 0:a out.mp4
```

## Codec Functions

### videoCodec

Adds `-c:v <codec>`.

```ts
pipe(command(), (cmd) => videoCodec(cmd, "libx264"), toCommand);
// ffmpeg -c:v libx264
```

### audioCodec

Adds `-c:a <codec>`.

```ts
pipe(command(), (cmd) => audioCodec(cmd, "aac"), toCommand);
// ffmpeg -c:a aac
```

### subtitleCodec

Adds `-c:s <codec>`.

```ts
pipe(command(), (cmd) => subtitleCodec(cmd, "mov_text"), toCommand);
// ffmpeg -c:s mov_text
```

## Bitrate Functions

### videoBitrate

Adds `-b:v <bitrate>`.

```ts
pipe(command(), (cmd) => videoBitrate(cmd, "2M"), toCommand);
// ffmpeg -b:v 2M
```

### audioBitrate

Adds `-b:a <bitrate>`.

```ts
pipe(command(), (cmd) => audioBitrate(cmd, "192k"), toCommand);
// ffmpeg -b:a 192k
```

## Filter Functions

### videoFilter

Adds `-vf <filter>`.

```ts
pipe(command(), (cmd) => videoFilter(cmd, "scale=1280:720"), toCommand);
// ffmpeg -vf scale=1280:720
```

### audioFilter

Adds `-af <filter>`.

```ts
pipe(command(), (cmd) => audioFilter(cmd, "volume=0.5"), toCommand);
// ffmpeg -af volume=0.5
```

### filterComplex

Adds `-filter_complex <filter>`.

```ts
pipe(
  command(),
  (cmd) => filterComplex(cmd, "[0:v]scale=1280:720[v]"),
  toCommand
);
// ffmpeg -filter_complex '[0:v]scale=1280:720[v]'
```

## Video Output Functions

### resolution

Adds `-s <width>x<height>`.

```ts
pipe(command(), (cmd) => resolution(cmd, 1280, 720), toCommand);
// ffmpeg -s 1280x720
```

### frameRate

Adds `-r <fps>`.

```ts
pipe(command(), (cmd) => frameRate(cmd, 30), toCommand);
// ffmpeg -r 30
```

### pixelFormat

Adds `-pix_fmt <format>`.

```ts
pipe(command(), (cmd) => pixelFormat(cmd, "yuv420p"), toCommand);
// ffmpeg -pix_fmt yuv420p
```

## Audio Output Functions

### audioSampleRate

Adds `-ar <rate>`.

```ts
pipe(command(), (cmd) => audioSampleRate(cmd, 44100), toCommand);
// ffmpeg -ar 44100
```

### audioChannels

Adds `-ac <count>`.

```ts
pipe(command(), (cmd) => audioChannels(cmd, 2), toCommand);
// ffmpeg -ac 2
```

## Format Function

### format

Adds `-f <fmt>`.

```ts
pipe(command(), (cmd) => format(cmd, "mp4"), toCommand);
// ffmpeg -f mp4
```

## Flag Functions

### overwrite

Adds `-y`.

```ts
pipe(command(), overwrite, toCommand);
// ffmpeg -y
```

### noOverwrite

Adds `-n`.

```ts
pipe(command(), noOverwrite, toCommand);
// ffmpeg -n
```

### hideBanner

Adds `-hide_banner`.

```ts
pipe(command(), hideBanner, toCommand);
// ffmpeg -hide_banner
```

### disableVideo

Adds `-vn`.

```ts
pipe(command(), disableVideo, toCommand);
// ffmpeg -vn
```

### disableAudio

Adds `-an`.

```ts
pipe(command(), disableAudio, toCommand);
// ffmpeg -an
```

### disableSubtitles

Adds `-sn`.

```ts
pipe(command(), disableSubtitles, toCommand);
// ffmpeg -sn
```

## Runtime Functions

### logLevel

Adds `-loglevel <level>`.

```ts
pipe(command(), (cmd) => logLevel(cmd, "debug"), toCommand);
// ffmpeg -loglevel debug
```

### threads

Adds `-threads <count>`.

```ts
pipe(command(), (cmd) => threads(cmd, 4), toCommand);
// ffmpeg -threads 4
```

## Timing Functions

### duration

Adds `-t <duration>`.

```ts
pipe(command(), (cmd) => duration(cmd, "00:00:10"), toCommand);
// ffmpeg -t 00:00:10
```

### startTime

Adds `-ss <time>`.

```ts
pipe(command(), (cmd) => startTime(cmd, "00:01:30"), toCommand);
// ffmpeg -ss 00:01:30
```

## Bulk Options

### conform

Adds multiple options from an object.

Each key becomes `-<key>`. Values that are `null`, `undefined`, or `true` become bare flags. Other values are converted to strings and appended as option values.

```ts
pipe(
  command(),
  (cmd) => input(cmd, "in.mp4"),
  (cmd) => conform(cmd, { "c:v": "libx264", preset: "fast", y: true }),
  (cmd) => output(cmd, "out.mp4"),
  toCommand
);

// ffmpeg -i in.mp4 -c:v libx264 -preset fast -y out.mp4
```

## Terminal Functions

### toArgs

Returns the executable and tokens as an array. This is useful for `child_process.spawn`.

```ts
const args = pipe(
  command(),
  (cmd) => input(cmd, "in.mp4"),
  (cmd) => output(cmd, "out.mp4"),
  toArgs
);

// ["ffmpeg", "-i", "in.mp4", "out.mp4"]
```

### toCommand

Returns a shell-safe command string.

```ts
const commandText = pipe(
  command(),
  (cmd) => input(cmd, "my video.mp4"),
  (cmd) => output(cmd, "out file.mp4"),
  toCommand
);

// ffmpeg -i 'my video.mp4' 'out file.mp4'
```

## Complete Example

```ts
import {
  audioCodec,
  command,
  frameRate,
  input,
  output,
  overwrite,
  resolution,
  toCommand,
  videoCodec,
} from "./ffmpeg";

function pipe(value: unknown, ...fns: Array<(value: any) => any>): any {
  return fns.reduce((current, fn) => fn(current), value);
}

const commandText = pipe(
  command(),
  overwrite,
  (cmd) => input(cmd, "input.mkv"),
  (cmd) => videoCodec(cmd, "libx264"),
  (cmd) => audioCodec(cmd, "aac"),
  (cmd) => resolution(cmd, 1920, 1080),
  (cmd) => frameRate(cmd, 24),
  (cmd) => output(cmd, "output.mp4"),
  toCommand
);

console.log(commandText);
// ffmpeg -y -i input.mkv -c:v libx264 -c:a aac -s 1920x1080 -r 24 output.mp4
```

## Notes

- `toCommand` and `toArgs` are terminal functions because they return `string` and `string[]`, not `FfmpegCommand`.
- Terminal functions can be the last function in a generic `pipe` helper.
- Do not put additional builder functions after `toCommand` or `toArgs`, because the value is no longer an `FfmpegCommand`.
- The builder does not enforce ffmpeg option placement rules. It preserves whatever order you build.
- `inputOption` and `inputOptionValue` are behaviorally the same as `option` and `optionValue`; they exist for readability.
- `outputOption` and `outputOptionValue` are behaviorally the same as `option` and `optionValue`; they exist for readability.
