# Relationship Notifier

Relationship Notifier is a Revenge/Vendetta-compatible Discord mobile plugin that keeps a local snapshot of your friend list and joined servers. It alerts you when a previously recorded friend disappears from your friends list or a previously recorded server disappears from your guild list.

## What it does

- Stores a local baseline of all visible friends and servers on first load.
- Subscribes to Discord Flux events for relationship and guild removals.
- Re-scans periodically so removals are still detected if an event name changes or fires while the plugin is loading.
- Attempts to send an Android/native notification first, then falls back to an in-app toast if the running client does not expose a compatible notification bridge.
- Provides `/relationship-notifier-resync` to refresh the baseline without sending alerts.

## Install

1. Host this repository or the plugin folder with a static file server/GitHub Pages setup supported by your Revenge plugin installer.
2. Add the plugin URL in Revenge's plugin screen.
3. Enable the plugin and reload Discord.
4. The first load only records the current baseline; alerts start on later scans/events.

## Notes

- The snapshot stays in Revenge plugin storage on the device.
- The plugin can only compare data that Discord exposes to the client. If Discord temporarily hides a guild or friend during startup, the next scan will refresh the stored state.
- Android notification APIs differ across Discord/Revenge builds, so the plugin tries several known native notification method names before falling back to `showToast`.
