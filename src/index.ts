import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher, ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { showToast } from "@vendetta/ui/toasts";

type SnapshotEntry = { id: string; label: string; seenAt: number };
type Snapshot = Record<string, SnapshotEntry>;
type StorageShape = {
  version?: number;
  friends?: Snapshot;
  guilds?: Snapshot;
  ready?: boolean;
  lastScanAt?: number;
};

type RemovalKind = "friend" | "guild";
type Removal = { kind: RemovalKind; entry: SnapshotEntry };

const PLUGIN_NAME = "Relationship Notifier";
const STORAGE_VERSION = 2;
const FRIEND_TYPE = 1;
const SCAN_EVERY_MS = 60_000;
const DEBOUNCE_MS = 1_000;
const store = storage as StorageShape;

const RelationshipStore = findByStoreName("RelationshipStore") ?? findByProps("getRelationships");
const UserStore = findByStoreName("UserStore") ?? findByProps("getUser");
const GuildStore = findByStoreName("GuildStore") ?? findByProps("getGuilds");

let interval: ReturnType<typeof setInterval> | undefined;
let debounce: ReturnType<typeof setTimeout> | undefined;
const listeners: Array<[string, (event: unknown) => void]> = [];

function ensureStorage() {
  store.version = STORAGE_VERSION;
  store.friends ??= {};
  store.guilds ??= {};
  store.ready ??= false;
  store.lastScanAt ??= 0;
}

function labelUser(user: any, id: string) {
  return user?.globalName ?? user?.global_name ?? user?.displayName ?? user?.username ?? user?.tag ?? id;
}

function labelGuild(guild: any, id: string) {
  return guild?.name ?? guild?.properties?.name ?? id;
}

function friendIds() {
  if (typeof RelationshipStore?.getFriendIDs === "function") return RelationshipStore.getFriendIDs() as string[];
  if (typeof RelationshipStore?.getFriendIds === "function") return RelationshipStore.getFriendIds() as string[];

  const relationships =
    typeof RelationshipStore?.getRelationships === "function" ? RelationshipStore.getRelationships() : {};

  return Object.entries(relationships)
    .filter(([, relationship]) => relationship === FRIEND_TYPE)
    .map(([id]) => id);
}

function currentFriends(): Snapshot {
  const seenAt = Date.now();
  return Object.fromEntries(
    friendIds().map((id) => [id, { id, label: labelUser(UserStore?.getUser?.(id), id), seenAt }]),
  );
}

function currentGuilds(): Snapshot {
  const seenAt = Date.now();
  const guilds = typeof GuildStore?.getGuilds === "function" ? GuildStore.getGuilds() : {};

  return Object.fromEntries(
    Object.entries(guilds).map(([id, guild]) => [id, { id, label: labelGuild(guild, id), seenAt }]),
  );
}

function removed(kind: RemovalKind, previous: Snapshot | undefined, next: Snapshot): Removal[] {
  return Object.values(previous ?? {})
    .filter((entry) => !next[entry.id])
    .map((entry) => ({ kind, entry }));
}

function notify(removal: Removal) {
  const isFriend = removal.kind === "friend";
  const title = isFriend ? "Friend removed" : "Server removed";
  const body = isFriend
    ? `${removal.entry.label} is no longer in your friends list.`
    : `You are no longer in ${removal.entry.label}.`;

  const payload = {
    title,
    body,
    message: body,
    channelId: "relationship-notifier",
    identifier: `relationship-notifier-${removal.kind}-${removal.entry.id}-${Date.now()}`,
    smallIcon: "ic_notification",
  };

  const modules = [
    findByProps("displayNotification"),
    findByProps("showNotification"),
    findByProps("presentLocalNotification"),
    ReactNative?.NativeModules?.Notifications,
  ];
  const methods = ["displayNotification", "showNotification", "presentLocalNotification", "localNotification", "notify"];

  for (const module of modules) {
    for (const method of methods) {
      if (typeof module?.[method] === "function") {
        module[method](payload);
        return;
      }
    }
  }

  showToast(`${title}: ${body}`);
}

function writeSnapshot(friends: Snapshot, guilds: Snapshot) {
  store.friends = friends;
  store.guilds = guilds;
  store.ready = true;
  store.lastScanAt = Date.now();
}

function scan({ silent = false } = {}) {
  ensureStorage();
  const friends = currentFriends();
  const guilds = currentGuilds();

  if (store.ready && !silent) {
    for (const removal of [...removed("friend", store.friends, friends), ...removed("guild", store.guilds, guilds)]) {
      notify(removal);
    }
  }

  writeSnapshot(friends, guilds);
}

function scheduleSilentScan() {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => scan({ silent: true }), DEBOUNCE_MS);
}

function eventId(event: any) {
  return event?.relationship?.id ?? event?.user?.id ?? event?.userId ?? event?.guild?.id ?? event?.guildId ?? event?.id;
}

function handleRelationshipRemove(event: unknown) {
  const entry = store.friends?.[eventId(event)];
  if (entry) notify({ kind: "friend", entry });
  scheduleSilentScan();
}

function handleGuildDelete(event: any) {
  if (event?.guild?.unavailable || event?.unavailable) return scheduleSilentScan();

  const entry = store.guilds?.[eventId(event)];
  if (entry) notify({ kind: "guild", entry });
  scheduleSilentScan();
}

function subscribe(event: string, handler: (event: unknown) => void) {
  FluxDispatcher?.subscribe?.(event, handler);
  listeners.push([event, handler]);
}

function unsubscribeAll() {
  for (const [event, handler] of listeners.splice(0)) FluxDispatcher?.unsubscribe?.(event, handler);
}

export default {
  onLoad() {
    ensureStorage();
    subscribe("RELATIONSHIP_REMOVE", handleRelationshipRemove);
    subscribe("GUILD_DELETE", handleGuildDelete);
    subscribe("CONNECTION_OPEN", scheduleSilentScan);
    scan({ silent: false });
    interval = setInterval(scan, SCAN_EVERY_MS);
  },
  onUnload() {
    unsubscribeAll();
    if (interval) clearInterval(interval);
    if (debounce) clearTimeout(debounce);
  },
  resyncBaseline() {
    scan({ silent: true });
    showToast(`${PLUGIN_NAME}: baseline refreshed.`);
  },
};
