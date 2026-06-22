import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher, React, ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { showToast } from "@vendetta/ui/toasts";

type ChangeKind = "friend" | "guild";
type ChangeAction = "added" | "removed";
type SnapshotEntry = { id: string; label: string; seenAt: number };
type Snapshot = Record<string, SnapshotEntry>;
type ChangeRecord = SnapshotEntry & {
  changeId: string;
  kind: ChangeKind;
  action: ChangeAction;
  changedAt: number;
};
type FilterValue = "all" | "friend" | "guild" | "friend-added" | "friend-removed" | "guild-added" | "guild-removed";
type StorageShape = {
  version?: number;
  friends?: Snapshot;
  guilds?: Snapshot;
  ready?: boolean;
  lastScanAt?: number;
  changes?: ChangeRecord[];
};

const PLUGIN_NAME = "Relationship Notifier";
const STORAGE_VERSION = 3;
const FRIEND_TYPE = 1;
const SCAN_EVERY_MS = 60_000;
const DEBOUNCE_MS = 750;
const MAX_CHANGES = 250;
const CHANNEL_ID = "relationship-notifier";
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
  store.changes ??= [];
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

  const relationships = typeof RelationshipStore?.getRelationships === "function" ? RelationshipStore.getRelationships() : {};

  return Object.entries(relationships)
    .filter(([, relationship]) => relationship === FRIEND_TYPE)
    .map(([id]) => id);
}

function currentFriends(): Snapshot {
  const seenAt = Date.now();
  return Object.fromEntries(friendIds().map((id) => [id, { id, label: labelUser(UserStore?.getUser?.(id), id), seenAt }]));
}

function currentGuilds(): Snapshot {
  const seenAt = Date.now();
  const guilds = typeof GuildStore?.getGuilds === "function" ? GuildStore.getGuilds() : {};

  return Object.fromEntries(Object.entries(guilds).map(([id, guild]) => [id, { id, label: labelGuild(guild, id), seenAt }]));
}

function compare(kind: ChangeKind, previous: Snapshot | undefined, next: Snapshot): ChangeRecord[] {
  const changedAt = Date.now();
  const changes: ChangeRecord[] = [];

  for (const entry of Object.values(next)) {
    if (!previous?.[entry.id]) changes.push({ ...entry, kind, action: "added", changedAt, changeId: `${kind}:added:${entry.id}:${changedAt}` });
  }

  for (const entry of Object.values(previous ?? {})) {
    if (!next[entry.id]) changes.push({ ...entry, kind, action: "removed", changedAt, changeId: `${kind}:removed:${entry.id}:${changedAt}` });
  }

  return changes;
}

function notificationText(change: ChangeRecord) {
  if (change.kind === "friend") {
    return {
      title: change.action === "added" ? "Mutual added" : "Mutual removed",
      body: change.action === "added" ? `${change.label} is now in your friends list.` : `${change.label} removed you from their friends list.`,
    };
  }

  return {
    title: change.action === "added" ? "Server added" : "Server removed",
    body: change.action === "added" ? `You were added to ${change.label}.` : `You were removed from ${change.label}.`,
  };
}

function notify(change: ChangeRecord) {
  const { title, body } = notificationText(change);
  const payload = { title, body, message: body, channelId: CHANNEL_ID, identifier: change.changeId, smallIcon: "ic_notification" };
  const modules = [findByProps("displayNotification"), findByProps("showNotification"), findByProps("presentLocalNotification"), ReactNative?.NativeModules?.Notifications];
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

function recordChanges(changes: ChangeRecord[]) {
  if (!changes.length) return;
  store.changes = [...changes, ...(store.changes ?? [])].slice(0, MAX_CHANGES);
  changes.forEach(notify);
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
    recordChanges([...compare("friend", store.friends, friends), ...compare("guild", store.guilds, guilds)]);
  }

  writeSnapshot(friends, guilds);
}

function scheduleScan() {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => scan({ silent: false }), DEBOUNCE_MS);
}

function subscribe(event: string, handler: (event: unknown) => void) {
  FluxDispatcher?.subscribe?.(event, handler);
  listeners.push([event, handler]);
}

function unsubscribeAll() {
  for (const [event, handler] of listeners.splice(0)) FluxDispatcher?.unsubscribe?.(event, handler);
}

function matchesFilter(change: ChangeRecord, filter: FilterValue) {
  if (filter === "all") return true;
  if (filter === "friend" || filter === "guild") return change.kind === filter;
  const [kind, action] = filter.split("-");
  return change.kind === kind && change.action === action;
}

function ChangeLogSettings() {
  ensureStorage();
  const [filter, setFilter] = React.useState("all" as FilterValue);
  const changes = (store.changes ?? []).filter((change) => matchesFilter(change, filter));
  const filters: Array<[FilterValue, string]> = [
    ["all", "All"],
    ["friend", "Mutuals"],
    ["friend-added", "Mutual adds"],
    ["friend-removed", "Mutual removals"],
    ["guild", "Servers"],
    ["guild-added", "Server adds"],
    ["guild-removed", "Server removals"],
  ];

  const e = React.createElement;
  const { ScrollView, View, Text, Pressable } = ReactNative;

  return e(
    ScrollView,
    { style: { padding: 16 } },
    e(Text, { style: { color: "white", fontSize: 22, fontWeight: "700", marginBottom: 8 } }, PLUGIN_NAME),
    e(Text, { style: { color: "#b9bbbe", marginBottom: 12 } }, "Review every recorded mutual and server addition or removal."),
    e(
      View,
      { style: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 } },
      ...filters.map(([value, label]) =>
        e(
          Pressable,
          { key: value, onPress: () => setFilter(value), style: { backgroundColor: filter === value ? "#5865f2" : "#2f3136", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 } },
          e(Text, { style: { color: "white", fontWeight: "600" } }, label),
        ),
      ),
    ),
    changes.length
      ? changes.map((change) => {
          const { title, body } = notificationText(change);
          return e(
            View,
            { key: change.changeId, style: { backgroundColor: "#2f3136", borderRadius: 12, marginBottom: 10, padding: 12 } },
            e(Text, { style: { color: "white", fontWeight: "700", marginBottom: 4 } }, title),
            e(Text, { style: { color: "#dcddde", marginBottom: 6 } }, body),
            e(Text, { style: { color: "#8e9297", fontSize: 12 } }, new Date(change.changedAt).toLocaleString()),
          );
        })
      : e(Text, { style: { color: "#b9bbbe" } }, "No changes recorded for this filter yet."),
  );
}

export default {
  onLoad() {
    ensureStorage();
    subscribe("RELATIONSHIP_ADD", scheduleScan);
    subscribe("RELATIONSHIP_REMOVE", scheduleScan);
    subscribe("GUILD_CREATE", scheduleScan);
    subscribe("GUILD_DELETE", scheduleScan);
    subscribe("CONNECTION_OPEN", scheduleScan);
    scan({ silent: false });
    interval = setInterval(scan, SCAN_EVERY_MS);
  },
  onUnload() {
    unsubscribeAll();
    if (interval) clearInterval(interval);
    if (debounce) clearTimeout(debounce);
  },
  settings: ChangeLogSettings,
  resyncBaseline() {
    scan({ silent: true });
    showToast(`${PLUGIN_NAME}: baseline refreshed.`);
  },
};
