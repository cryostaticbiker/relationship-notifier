# Relationship Notifier

Relationship Notifier is a Revenge-compatible Discord mobile plugin that watches the relationships and guilds visible to the client. After its first baseline scan, it sends a mobile/local notification every time it detects one of these changes:

- a mutual/friend is added;
- a mutual/friend removes you or otherwise disappears from your friend list;
- you are added to a server;
- you are removed from a server.

The plugin also adds a settings page with a filterable change log. You can view all recorded changes or filter to mutual additions, mutual removals, server additions, or server removals.

> Note: mobile clients expose local notification APIs differently. The plugin now tries Notifee-style, React Native local notification, and native module notification bridges first, then falls back to an in-app toast if the current Revenge/Discord build does not expose one. Because Revenge plugins run inside Discord, this is a local/mobile notification while Discord is running, not a remote APNs/FCM server push while the app is fully killed.

## Repository layout

```text
manifest.json            # Root manifest for repository/GitHub Pages installs
index.js                 # Runtime plugin expression consumed by Revenge
src/index.ts             # Typed source mirror of the runtime logic
status.json              # Plugin-list style status metadata
dist/manifest.json       # Generated install manifest; main points to index.js
dist/index.js            # Generated install script copied from index.js
scripts/build.mjs        # Build script that refreshes dist/ and manifest hashes
scripts/verify-install-url.mjs
```

## Prerequisites

Install Node.js and npm. Then install the development dependencies from the repository root:

```sh
npm install
```

If your npm environment blocks registry access, install the dependencies using a network/registry configuration that can fetch the packages listed in `package.json` and `package-lock.json`.

## Build and typecheck

Run these commands from the repository root:

```sh
npm run typecheck
npm run build
```

`npm run typecheck` runs TypeScript without emitting files. `npm run build` copies `index.js` to `dist/index.js`, writes `dist/manifest.json`, and updates the SHA-256 hash in both manifests.

After every edit to `index.js` or `manifest.json`, run:

```sh
npm run build
```

Commit the generated `dist/index.js` and `dist/manifest.json` files with the source changes so Revenge can install the latest version.

## Verify the install folder locally

After building, verify the local install layout:

```sh
npm run verify:local
```

A successful check prints the folder URL, manifest URL, and script URL. You can also serve the repo locally for phone testing:

```sh
python3 -m http.server 8080
```

Then install this URL in Revenge, replacing the IP address with your computer's LAN IP:

```text
http://YOUR_COMPUTER_LAN_IP:8080/dist/
```

Your phone and computer must be on the same network.

## Publish on GitHub Pages

1. Create a public GitHub repository for this plugin.
2. Push the repository with these files committed:
   - `manifest.json`
   - `index.js`
   - `status.json`
   - `dist/manifest.json`
   - `dist/index.js`
   - the supporting source/scripts/docs files
3. On GitHub, open the repository and go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Select the branch you pushed, usually `main`, and select `/ (root)` as the folder.
6. Click **Save** and wait for GitHub Pages to deploy.
7. GitHub will show a Pages URL like:

   ```text
   https://YOUR_GITHUB_USERNAME.github.io/relationship-notifier/
   ```

8. In Revenge, open **Plugins**, tap **+**, and paste the plugin folder URL. For this repository layout, use the `dist/` folder and keep the trailing slash:

   ```text
   https://YOUR_GITHUB_USERNAME.github.io/relationship-notifier/dist/
   ```

9. If installation fails, open this URL in a browser and confirm it displays JSON:

   ```text
   https://YOUR_GITHUB_USERNAME.github.io/relationship-notifier/dist/manifest.json
   ```

## Alternative install URL with jsDelivr

If the repository is public on GitHub, you can also install from jsDelivr after building and pushing `dist/`:

```text
https://cdn.jsdelivr.net/gh/YOUR_GITHUB_USERNAME/relationship-notifier@main/dist/
```

Replace `YOUR_GITHUB_USERNAME` and `main` with your GitHub username and branch name. Keep the trailing slash.

## Using the settings page

Open the plugin settings in Revenge to view the change log. Use **Send test notification** at the top of the settings page to confirm that your current Discord/Revenge build exposes a native notification bridge. The available filters are:

- **All**: every recorded mutual and server change;
- **Mutuals**: all mutual additions and removals;
- **Mutual adds**: only users who appeared in your friend list;
- **Mutual removals**: only users who disappeared from your friend list;
- **Servers**: all server additions and removals;
- **Server adds**: only servers that appeared in your guild list;
- **Server removals**: only servers that disappeared from your guild list.

The first plugin load creates a baseline and does not alert for existing mutuals or servers. Changes are recorded after that baseline exists. The log keeps the newest 250 entries on the device in Revenge plugin storage.
