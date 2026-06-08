import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher, ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { showToast } from "@vendetta/ui/toasts";

type StoredEntity = {
  id: string;
  name: string;
  recordedAt: number;
};

type Snapshot = Record<string, StoredEntity>;

type PluginStorage = {
  friends?: Snapshot;
  guilds?: Snapshot;
  initializedAt?: number;
  lastScanAt?: number;
  notifyOnUnfriends?: boolean;
  notifyOnGuildRemoval?: boolean;
  scanIntervalMs?: number;
};

type Change = {
  kind: "friend" | "guild";
  entity: StoredEntity;
};

type NativeNotificationOptions = {
  title: string;
  body: string;
  channelId?: string;
  identifier?: string;
  smallIcon?: string;
  userInfo?: Record<string, unknown>;
};

const vstorage = storage as PluginStorage;

const DEFAULT_SCAN_INTERVAL_MS = 60_000;
const FRIEND_RELATIONSHIP_TYPE = 1;
const NOTIFICATION_CHANNEL_ID = "relationship-notifier";

const RelationshipStore = findByStoreName("RelationshipStore");
const UserStore = findByStoreName("UserStore");
const GuildStore = findByStoreName("GuildStore");
const AndroidNotificationModule = findByProps("displayNotification") ?? findByProps("showNotification");
const LocalNotificationModule = findByProps("presentLocalNotification") ?? findByProps("localNotification");

let scanTimer: ReturnType<typeof setInterval> | undefined;
let suppressNextScan = false;

function now() {
  return Date.now();
}

function getDisplayName(user: any, fallbackId: string) {
  return user?.globalName ?? user?.username ?? user?.tag ?? fallbackId;
}

function getGuildName(guild: any, fallbackId: string) {
  return guild?.name ?? guild?.properties?.name ?? fallbackId;
}

function getFriendIds() {
  if (typeof RelationshipStore?.getFriendIDs === "function") {
    return RelationshipStore.getFriendIDs() as string[];
  }

  const relationships =
    typeof RelationshipStore?.getRelationships === "function" ? RelationshipStore.getRelationships() : {};

  return Object.entries(relationships)
    .filter(([, relationshipType]) => relationshipType === FRIEND_RELATIONSHIP_TYPE)
    .map(([id]) => id);
}

function readCurrentFriends(): Snapshot {
  return Object.fromEntries(
    getFriendIds().map((id) => [
      id,
      {
        id,
        name: getDisplayName(UserStore?.getUser?.(id), id),
        recordedAt: now(),
      },
    ]),
  );
}

function readCurrentGuilds(): Snapshot {
  const guilds = typeof GuildStore?.getGuilds === "function" ? GuildStore.getGuilds() : {};

  return Object.fromEntries(
    Object.entries(guilds).map(([id, guild]) => [
      id,
      {
        id,
        name: getGuildName(guild, id),
        recordedAt: now(),
      },
    ]),
  );
}

function findRemoved(previous: Snapshot | undefined, current: Snapshot): StoredEntity[] {
  if (!previous) return [];

  return Object.values(previous).filter((entity) => !current[entity.id]);
}

function persistSnapshot(friends: Snapshot, guilds: Snapshot) {
  vstorage.friends = friends;
  vstorage.guilds = guilds;
  vstorage.lastScanAt = now();
}

function notificationBody(change: Change) {
  if (change.kind === "friend") {
    return `${change.entity.name} is no longer in your friends list.`;
  }

  return `You are no longer in ${change.entity.name}.`;
}

function dispatchDiscordLocalNotification(options: NativeNotificationOptions) {
  const payload = {
    title: options.title,
    body: options.body,
    message: options.body,
    channelId: options.channelId,
    identifier: options.identifier,
    smallIcon: options.smallIcon,
    userInfo: options.userInfo,
  };

  const candidates = [AndroidNotificationModule, LocalNotificationModule, ReactNative?.NativeModules?.Notifications];
  const methodNames = [
    "displayNotification",
    "showNotification",
    "presentLocalNotification",
    "localNotification",
    "scheduleLocalNotification",
    "notify",
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    for (const methodName of methodNames) {
      const method = candidate[methodName];
      if (typeof method === "function") {
        method.call(candidate, payload);
        return true;
      }
    }
  }

  return false;
}

function notify(change: Change) {
  const title = change.kind === "friend" ? "Friend removed" : "Server removed";
  const body = notificationBody(change);
  const delivered = dispatchDiscordLocalNotification({
    title,
    body,
    channelId: NOTIFICATION_CHANNEL_ID,
    identifier: `relationship-notifier-${change.kind}-${change.entity.id}-${now()}`,
    smallIcon: "ic_notification",
    userInfo: {
      plugin: "relationship-notifier",
      kind: change.kind,
      id: change.entity.id,
    },
  });

  if (!delivered) {
    showToast(`${title}: ${body}`);
  }
}

function scan() {
  const currentFriends = readCurrentFriends();
  const currentGuilds = readCurrentGuilds();

  if (!vstorage.initializedAt) {
    vstorage.initializedAt = now();
    persistSnapshot(currentFriends, currentGuilds);
    return;
  }

  if (!suppressNextScan) {
    if (vstorage.notifyOnUnfriends) {
      findRemoved(vstorage.friends, currentFriends).forEach((entity) => notify({ kind: "friend", entity }));
    }

    if (vstorage.notifyOnGuildRemoval) {
      findRemoved(vstorage.guilds, currentGuilds).forEach((entity) => notify({ kind: "guild", entity }));
    }
  }

  suppressNextScan = false;
  persistSnapshot(currentFriends, currentGuilds);
}

function scanSoon() {
  setTimeout(scan, 750);
}

function handleRelationshipRemove(event: any) {
  const id = event?.relationship?.id ?? event?.user?.id ?? event?.userId ?? event?.id;
  const knownFriend = id ? vstorage.friends?.[id] : undefined;

  if (vstorage.notifyOnUnfriends && knownFriend) {
    notify({ kind: "friend", entity: knownFriend });
    delete vstorage.friends?.[knownFriend.id];
  }

  scanSoon();
}

function handleGuildDelete(event: any) {
  const id = event?.guild?.id ?? event?.guildId ?? event?.id;
  const knownGuild = id ? vstorage.guilds?.[id] : undefined;

  if (vstorage.notifyOnGuildRemoval && knownGuild) {
    notify({ kind: "guild", entity: knownGuild });
    delete vstorage.guilds?.[knownGuild.id];
  }

  scanSoon();
}

const subscriptions: Array<[string, (event: any) => void]> = [
  ["RELATIONSHIP_REMOVE", handleRelationshipRemove],
  ["GUILD_DELETE", handleGuildDelete],
  ["GUILD_UNAVAILABLE", scanSoon],
  ["CONNECTION_OPEN", scanSoon],
];

function subscribeAll() {
  for (const [event, handler] of subscriptions) {
    FluxDispatcher?.subscribe?.(event, handler);
  }
}

function unsubscribeAll() {
  for (const [event, handler] of subscriptions) {
    FluxDispatcher?.unsubscribe?.(event, handler);
  }
}

function applyDefaults() {
  vstorage.notifyOnUnfriends ??= true;
  vstorage.notifyOnGuildRemoval ??= true;
  vstorage.scanIntervalMs ??= DEFAULT_SCAN_INTERVAL_MS;
}

export function onLoad() {
  applyDefaults();
  subscribeAll();
  scan();
  scanTimer = setInterval(scan, vstorage.scanIntervalMs);
}

export function onUnload() {
  unsubscribeAll();

  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = undefined;
  }
}

export const commands = [
  {
    name: "relationship-notifier-resync",
    displayName: "relationship-notifier-resync",
    description: "Refresh the Relationship Notifier baseline without sending alerts.",
    execute: () => {
      suppressNextScan = true;
      scan();
      showToast("Relationship Notifier baseline refreshed.");
    },
  },
];
