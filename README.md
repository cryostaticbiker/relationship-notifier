# Relationship Notifier

Relationship Notifier is a Revenge/Vendetta-compatible Discord mobile plugin that keeps a local snapshot of your friend list and joined servers. It alerts you when a previously recorded friend disappears from your friends list or a previously recorded server disappears from your guild list.

## Files

- `manifest.json` describes the plugin and points Revenge at `index.js`.
- `index.js` is the runnable plugin entrypoint loaded by Revenge/Vendetta.

## What it does

- Stores a local baseline of all visible friends and servers on first load.
- Subscribes to Discord Flux events for relationship and guild removals.
- Re-scans periodically so removals are still detected if an event name changes or fires during startup.
- Attempts to send an Android/native notification first, then falls back to an in-app toast if the running client does not expose a compatible notification bridge.
- Exposes `resyncBaseline()` from the plugin object for manual debugging/baseline refreshes without alerts.

## Install

1. Host this folder with `manifest.json` and `index.js` at the same URL path.
2. Add that folder URL in Revenge's plugin screen.
3. Enable the plugin and reload Discord.
4. The first load only records the current baseline; alerts start on later scans/events.

## Notes

- The snapshot stays in Revenge plugin storage on the device.
- The plugin only compares data that Discord exposes to the client.
- Guild outage/unavailable events refresh the baseline silently to avoid false server-removal alerts.
- Android notification APIs differ across Discord/Revenge builds, so the plugin tries several known native notification method names before falling back to `showToast`.
