---
name: whisper-voice
description: "Set up or troubleshoot local voice transcription with whisper.cpp through the bb whisper commands."
---

# Local voice (whisper.cpp)

The plugin registers the `whisper` AI service for voice transcription. Voice
input uses it when `BB_TRANSCRIPTION` is `whisper/<model>`, for example
`whisper/base.en`. Transcription runs on the primary host with `whisper-cli`
and `ffmpeg`; nothing is sent to a cloud service.

## Commands

```
bb whisper status [--host <id-or-name>] [--json]
bb whisper prepare <model> [--host <id-or-name>] [--json]
```

`status` reports the resolved `whisper-cli` and `ffmpeg` paths, the model
directory, downloaded models, and the current `BB_TRANSCRIPTION` value.

`prepare` downloads `ggml-<model>.bin` from the whisper.cpp Hugging Face
repository into the plugin's data directory on the host when it is missing,
then transcribes one second of silence so GPU shaders are compiled before the
first real recording. It may take several minutes for large models.

Both commands default to the primary host. Pass `--host` to target another
enrolled machine.

## Setup

1. `brew install whisper.cpp ffmpeg` on the host.
2. `bb whisper prepare base.en`
3. `bb-app config set BB_TRANSCRIPTION whisper/base.en`

## Troubleshooting

- "whisper-cli was not found": install whisper.cpp; the plugin searches `PATH`,
  `/opt/homebrew/bin`, `/usr/local/bin`, and `/home/linuxbrew/.linuxbrew/bin`.
- "is not downloaded on this host": run `bb whisper prepare <model>` with the
  model named in `BB_TRANSCRIPTION`.
- Transcription timed out: bb allows ten seconds per recording. Use a smaller
  model such as `base.en`, or run `bb whisper prepare` again after upgrading
  whisper.cpp so shader compilation happens outside a recording.
