# Relationship Notifier

Relationship Notifier is a Revenge/Vendetta-compatible Discord mobile plugin that keeps a local snapshot of your friend list and joined servers. It alerts you when a previously recorded friend disappears from your friends list or a previously recorded server disappears from your guild list.

## Required Revenge plugin layout

This repository is intentionally laid out as a directly installable Revenge plugin:

- `npm run build` creates the installable files in `dist/`.
- `dist/manifest.json` is fetched first by Revenge.
- `dist/manifest.json` has `"main": "index.js"`, so Revenge then fetches `dist/index.js` from the same folder URL.
- `dist/index.js` is the runnable plugin expression. Do not wrap it in CommonJS `module.exports`; Revenge evaluates the file as an expression and expects the result to contain `onLoad`/`onUnload`.
- `dist/manifest.json` includes a `hash` of `dist/index.js`; run `npm run build` after editing `index.js` so installed clients know to download the update.

## Fixing "failed to find manifest"

That error means Revenge could not fetch JSON from `<the URL you pasted>/manifest.json`. The most common cause is pasting the normal GitHub repository page, such as:

```text
https://github.com/YOUR_USERNAME/relationship-notifier
```

Do **not** paste the GitHub web page URL. It returns HTML, not `dist/manifest.json`. Use one of the install URLs below instead, and keep the trailing `/`.

Before pasting a URL into Revenge, you can test it from your computer:

```sh
node scripts/verify-install-url.mjs https://cdn.jsdelivr.net/gh/YOUR_USERNAME/relationship-notifier@main/dist/
```

If the check prints the folder, manifest, and script URLs, Revenge should be able to find the manifest.

## Install in Revenge

### GitHub Pages option

Use this method if you want the plugin to be importable directly from your GitHub account.

1. Create a public GitHub repository named `relationship-notifier`.
2. Run `npm run build` and commit the generated `dist/manifest.json` and `dist/index.js` files.
3. Push this repository's files to that GitHub repository. The repository root must contain the `dist/` folder with both `dist/manifest.json` and `dist/index.js`.
4. In GitHub, open the repository and go to **Settings → Pages**.
5. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
6. Set **Branch** to the branch that contains this plugin, usually `main`, and set the folder to `/ (root)`.
7. Click **Save** and wait for GitHub Pages to finish deploying. GitHub will show the published site URL.
8. In Revenge, go to **Plugins**, tap **+**, and paste this GitHub Pages import URL after replacing `YOUR_GITHUB_USERNAME` with your GitHub username:

   ```text
   https://YOUR_GITHUB_USERNAME.github.io/relationship-notifier/dist/
   ```

   For example, if your GitHub username is `octocat`, paste this exact URL into Revenge:

   ```text
   https://octocat.github.io/relationship-notifier/dist/
   ```

9. If Revenge still says `failed to find manifest`, open this URL in a browser after replacing `YOUR_GITHUB_USERNAME`; it must show the JSON contents of `dist/manifest.json`:

   ```text
   https://YOUR_GITHUB_USERNAME.github.io/relationship-notifier/dist/manifest.json
   ```

### jsDelivr option

If the repository is public on GitHub, paste a jsDelivr folder URL in Revenge:

```text
https://cdn.jsdelivr.net/gh/YOUR_USERNAME/relationship-notifier@main/dist/
```

Replace `YOUR_USERNAME` and `main` with your GitHub username and branch name. Keep the trailing `/`; Revenge fetches `manifest.json` relative to that folder URL.

### Local testing option

From the repository root, build the `dist/` files, then run a static server and install the LAN URL in Revenge:

```sh
npm run build
python3 -m http.server 8080
```

Then add this URL in Revenge, replacing `YOUR_COMPUTER_LAN_IP` with your computer's LAN IP address:

```text
http://YOUR_COMPUTER_LAN_IP:8080/dist/
```

Your phone and computer must be on the same network, and Android/Discord must be allowed to reach that local HTTP address.

## What it does

- Stores a local baseline of all visible friends and servers on first load.
- Subscribes to Discord Flux events for relationship and guild removals.
- Re-scans periodically so removals are still detected if an event name changes or fires during startup.
- Attempts to send an Android/native notification first, then falls back to an in-app toast if the running client does not expose a compatible notification bridge.
- Exposes `resyncBaseline()` from the plugin object for manual debugging/baseline refreshes without alerts.

## Notes

- The snapshot stays in Revenge plugin storage on the device.
- The plugin only compares data that Discord exposes to the client.
- Guild outage/unavailable events refresh the baseline silently to avoid false server-removal alerts.
- Android notification APIs differ across Discord/Revenge builds, so the plugin tries several known native notification method names before falling back to `showToast`.
