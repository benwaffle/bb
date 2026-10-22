Stop your Mac from going to idle sleep while bb runs long agent work. Enable the plugin once, and bb keeps the selected machines awake while any thread is running or starting, or while a background command runs. A minute after the last work stops, bb lets the machines sleep again.

## What you get

- One switch in the plugin settings that turns idle-sleep prevention on or off.
- A choice between all hosts and a list of specific hosts.
- Automatic reconnection. When a host connects again, bb applies the setting again.

## How it works

The plugin watches thread status and background commands across bb. While work runs, it holds an idle-sleep assertion on each selected host. It releases the assertion 60 seconds after the last work stops, so short gaps between turns do not toggle it. When bb stops, the assertion stops with it. The display can still turn off. Closing the lid or choosing Sleep still puts the Mac to sleep.

Use the settings page or the CLI to manage the plugin:

- `bb keep-awake status` shows the current state, the host selection, and whether the plugin is holding the hosts awake now.
- `bb keep-awake enable` and `bb keep-awake disable` change the switch.
- `bb keep-awake hosts all` selects every host. `bb keep-awake hosts` followed by one or more host ids selects specific hosts.

Add `--json` to any command for machine-readable output.

## Requirements

macOS and Windows hosts are supported. On macOS the plugin runs `caffeinate`; on Windows it holds a system-required execution state from a PowerShell process. Neither keeps the display on. On a Linux host, the plugin does nothing and writes a warning to the log.
