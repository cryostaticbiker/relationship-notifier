"use strict";
var relationshipNotifier = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    commands: () => commands,
    onLoad: () => onLoad,
    onUnload: () => onUnload
  });
  var import_metro = __require("@vendetta/metro");
  var import_common = __require("@vendetta/metro/common");
  var import_plugin = __require("@vendetta/plugin");
  var import_toasts = __require("@vendetta/ui/toasts");
  var vstorage = import_plugin.storage;
  var DEFAULT_SCAN_INTERVAL_MS = 6e4;
  var FRIEND_RELATIONSHIP_TYPE = 1;
  var NOTIFICATION_CHANNEL_ID = "relationship-notifier";
  var RelationshipStore = (0, import_metro.findByStoreName)("RelationshipStore");
  var UserStore = (0, import_metro.findByStoreName)("UserStore");
  var GuildStore = (0, import_metro.findByStoreName)("GuildStore");
  var AndroidNotificationModule = (0, import_metro.findByProps)("displayNotification") ?? (0, import_metro.findByProps)("showNotification");
  var LocalNotificationModule = (0, import_metro.findByProps)("presentLocalNotification") ?? (0, import_metro.findByProps)("localNotification");
  var scanTimer;
  var suppressNextScan = false;
  function now() {
    return Date.now();
  }
  function getDisplayName(user, fallbackId) {
    return user?.globalName ?? user?.username ?? user?.tag ?? fallbackId;
  }
  function getGuildName(guild, fallbackId) {
    return guild?.name ?? guild?.properties?.name ?? fallbackId;
  }
  function getFriendIds() {
    if (typeof RelationshipStore?.getFriendIDs === "function") {
      return RelationshipStore.getFriendIDs();
    }
    const relationships = typeof RelationshipStore?.getRelationships === "function" ? RelationshipStore.getRelationships() : {};
    return Object.entries(relationships).filter(([, relationshipType]) => relationshipType === FRIEND_RELATIONSHIP_TYPE).map(([id]) => id);
  }
  function readCurrentFriends() {
    return Object.fromEntries(
      getFriendIds().map((id) => [
        id,
        {
          id,
          name: getDisplayName(UserStore?.getUser?.(id), id),
          recordedAt: now()
        }
      ])
    );
  }
  function readCurrentGuilds() {
    const guilds = typeof GuildStore?.getGuilds === "function" ? GuildStore.getGuilds() : {};
    return Object.fromEntries(
      Object.entries(guilds).map(([id, guild]) => [
        id,
        {
          id,
          name: getGuildName(guild, id),
          recordedAt: now()
        }
      ])
    );
  }
  function findRemoved(previous, current) {
    if (!previous) return [];
    return Object.values(previous).filter((entity) => !current[entity.id]);
  }
  function persistSnapshot(friends, guilds) {
    vstorage.friends = friends;
    vstorage.guilds = guilds;
    vstorage.lastScanAt = now();
  }
  function notificationBody(change) {
    if (change.kind === "friend") {
      return `${change.entity.name} is no longer in your friends list.`;
    }
    return `You are no longer in ${change.entity.name}.`;
  }
  function dispatchDiscordLocalNotification(options) {
    const payload = {
      title: options.title,
      body: options.body,
      message: options.body,
      channelId: options.channelId,
      identifier: options.identifier,
      smallIcon: options.smallIcon,
      userInfo: options.userInfo
    };
    const candidates = [AndroidNotificationModule, LocalNotificationModule, import_common.ReactNative?.NativeModules?.Notifications];
    const methodNames = [
      "displayNotification",
      "showNotification",
      "presentLocalNotification",
      "localNotification",
      "scheduleLocalNotification",
      "notify"
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
  function notify(change) {
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
        id: change.entity.id
      }
    });
    if (!delivered) {
      (0, import_toasts.showToast)(`${title}: ${body}`);
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
  function handleRelationshipRemove(event) {
    const id = event?.relationship?.id ?? event?.user?.id ?? event?.userId ?? event?.id;
    const knownFriend = id ? vstorage.friends?.[id] : void 0;
    if (vstorage.notifyOnUnfriends && knownFriend) {
      notify({ kind: "friend", entity: knownFriend });
      delete vstorage.friends?.[knownFriend.id];
    }
    scanSoon();
  }
  function handleGuildDelete(event) {
    const id = event?.guild?.id ?? event?.guildId ?? event?.id;
    const knownGuild = id ? vstorage.guilds?.[id] : void 0;
    if (vstorage.notifyOnGuildRemoval && knownGuild) {
      notify({ kind: "guild", entity: knownGuild });
      delete vstorage.guilds?.[knownGuild.id];
    }
    scanSoon();
  }
  var subscriptions = [
    ["RELATIONSHIP_REMOVE", handleRelationshipRemove],
    ["GUILD_DELETE", handleGuildDelete],
    ["GUILD_UNAVAILABLE", scanSoon],
    ["CONNECTION_OPEN", scanSoon]
  ];
  function subscribeAll() {
    for (const [event, handler] of subscriptions) {
      import_common.FluxDispatcher?.subscribe?.(event, handler);
    }
  }
  function unsubscribeAll() {
    for (const [event, handler] of subscriptions) {
      import_common.FluxDispatcher?.unsubscribe?.(event, handler);
    }
  }
  function applyDefaults() {
    vstorage.notifyOnUnfriends ??= true;
    vstorage.notifyOnGuildRemoval ??= true;
    vstorage.scanIntervalMs ??= DEFAULT_SCAN_INTERVAL_MS;
  }
  function onLoad() {
    applyDefaults();
    subscribeAll();
    scan();
    scanTimer = setInterval(scan, vstorage.scanIntervalMs);
  }
  function onUnload() {
    unsubscribeAll();
    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = void 0;
    }
  }
  var commands = [
    {
      name: "relationship-notifier-resync",
      displayName: "relationship-notifier-resync",
      description: "Refresh the Relationship Notifier baseline without sending alerts.",
      execute: () => {
        suppressNextScan = true;
        scan();
        (0, import_toasts.showToast)("Relationship Notifier baseline refreshed.");
      }
    }
  ];
  return __toCommonJS(index_exports);
})();
