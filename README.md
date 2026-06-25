# Relationship Notifier

Relationship Notifier is a plugin for **Revenge** that monitors changes to your Discord account and notifies you whenever your relationships or server memberships change.

Once an initial baseline has been created, the plugin automatically detects:

* ➕ Friends or mutuals that are added
* ➖ Friends or mutuals that remove you or disappear
* 🏠 Servers you join
* 🚪 Servers you leave or are removed from

Detected events are stored locally in a searchable history.

> Notifications are local to your device while Discord/Revenge is running. They are **not** remote push notifications.

---

## Contents

* [Features](#features)
* [Repository Structure](#repository-structure)
* [Settings](#settings)
* [How It Works](#how-it-works)
* [Development](#development)

---

## Features

* Real-time relationship monitoring
* Friend and mutual tracking
* Server join/leave detection
* Local notifications
* Searchable and filterable history
* Test notification button
* One-tap log clearing
* Automatic baseline creation to prevent false positives
* Stores up to **250** recent events

[↑ Back to top](#relationship-notifier)

---

## Repository Structure

```text
.
├── index.js                # Runtime plugin
├── manifest.json           # Plugin manifest
├── status.json             # Status metadata
├── src/
│   └── index.ts            # TypeScript source
├── dist/
│   ├── index.js
│   └── manifest.json
└── scripts/
    ├── build.mjs
    └── verify-install-url.mjs
```

[↑ Back to top](#relationship-notifier)

---

## Settings

The plugin includes a built-in settings page where you can:

* View the complete event history
* Filter events by category
* Send a test notification
* Clear all stored logs

Available filters:

* All
* Mutuals
* Mutual Adds
* Mutual Removals
* Servers
* Server Adds
* Server Removals

[↑ Back to top](#relationship-notifier)

---

## How It Works

The first time the plugin runs, it creates a baseline of your current friends and servers.

No notifications are generated during this initial scan.

Once the baseline exists, future scans compare the current state against the stored baseline. Any additions or removals are recorded locally and displayed as notifications when supported by the current Revenge/Discord build.

The plugin stores the newest **250** events on the device until they are manually cleared.

[↑ Back to top](#relationship-notifier)

---

## Development

Install dependencies:

```bash
npm install
```

Type-check:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

The build process:

* Copies the runtime plugin into `dist/`
* Generates `dist/manifest.json`
* Updates manifest hashes

Run the build command whenever `index.js` or `manifest.json` changes.

[↑ Back to top](#relationship-notifier)
