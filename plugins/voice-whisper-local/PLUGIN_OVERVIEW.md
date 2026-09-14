Use voice input in bb without an OpenAI or Codex account. This plugin transcribes recordings on your own machine with whisper.cpp, so audio never leaves the host.

## What you get

- A `whisper` AI service that bb's microphone button can use for speech-to-text.
- `bb whisper prepare <model>` downloads a Whisper model onto the host and runs it once so the first real recording is fast.
- `bb whisper status` shows whether whisper.cpp and ffmpeg are installed and which models are downloaded.

## How it works

The plugin runs on the host that bb uses for transcription, normally your local machine. When you stop a recording, bb sends the audio to the host, ffmpeg converts it to 16 kHz mono WAV, and `whisper-cli` produces the text. Models live in the plugin's data directory on that host. Model names follow whisper.cpp: `tiny.en`, `base.en`, `small.en`, `medium.en`, `large-v3-turbo`, and so on. English-only models end in `.en`; other models detect the spoken language automatically.

Set it up once:

1. Install the tools on the host: `brew install whisper.cpp ffmpeg`.
2. Download a model: `bb whisper prepare base.en`.
3. Point voice input at it: `bb-app config set BB_TRANSCRIPTION whisper/base.en`.

`base.en` transcribes a ten-second clip in well under a second on Apple Silicon. `small.en` is more accurate and a few seconds slower. bb allows ten seconds per transcription, so larger models suit short recordings only.

Add `--json` to any command for machine-readable output, and `--host <id-or-name>` to target a machine other than the primary host.

## Requirements

`whisper-cli` and `ffmpeg` must be on the host's `PATH` or in a Homebrew bin directory. The first run of a freshly built whisper.cpp compiles GPU shaders, which can take fifteen seconds or more; `bb whisper prepare` absorbs that so voice input does not time out.
