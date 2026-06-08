(() => {
  const PLUGIN_NAME = "Relationship Notifier";
  const STORAGE_VERSION = 1;
  const FRIEND_RELATIONSHIP_TYPE = 1;
  const SCAN_INTERVAL_MS = 60_000;
  const RESCAN_DELAY_MS = 1_000;
  const NOTIFICATION_CHANNEL_ID = "relationship-notifier";

  const storage = vendetta.plugin.storage;
  const metro = vendetta.metro;
  const common = metro.common ?? {};
  const FluxDispatcher = common.FluxDispatcher;
  const ReactNative = common.ReactNative;
  const showToast = vendetta.ui?.toasts?.showToast ?? (() => undefined);
  const logger = vendetta.logger ?? console;

  let scanTimer;
  let rescanTimer;

  const subscriptions = [];

  function timestamp() {
    return Date.now();
  }

  function getStore(name, fallbackProps) {
    if (typeof metro.findByStoreName === "function") {
      const store = metro.findByStoreName(name);
      if (store) return store;
    }

    return metro.findByProps?.(...fallbackProps);
  }

  const RelationshipStore = getStore("RelationshipStore", ["getRelationships"]);
  const UserStore = getStore("UserStore", ["getUser", "getCurrentUser"]);
  const GuildStore = getStore("GuildStore", ["getGuilds", "getGuild"]);

  function ensureStorage() {
    storage.version ??= STORAGE_VERSION;
    storage.friends ??= {};
    storage.guilds ??= {};
    storage.initializedAt ??= 0;
    storage.lastScanAt ??= 0;
    storage.notifyOnUnfriends ??= true;
    storage.notifyOnGuildRemoval ??= true;
  }

  function displayNameForUser(user, fallbackId) {
    return user?.globalName ?? user?.global_name ?? user?.displayName ?? user?.username ?? user?.tag ?? fallbackId;
  }

  function displayNameForGuild(guild, fallbackId) {
    return guild?.name ?? guild?.properties?.name ?? fallbackId;
  }

  function getFriendIds() {
    if (typeof RelationshipStore?.getFriendIDs === "function") return RelationshipStore.getFriendIDs();
    if (typeof RelationshipStore?.getFriendIds === "function") return RelationshipStore.getFriendIds();

    const relationships =
      typeof RelationshipStore?.getRelationships === "function" ? RelationshipStore.getRelationships() : {};

    return Object.entries(relationships)
      .filter(([, type]) => type === FRIEND_RELATIONSHIP_TYPE)
      .map(([id]) => id);
  }

  function getGuilds() {
    return typeof GuildStore?.getGuilds === "function" ? GuildStore.getGuilds() : {};
  }

  function snapshotFriends() {
    return Object.fromEntries(
      getFriendIds().map((id) => [
        id,
        {
          id,
          name: displayNameForUser(UserStore?.getUser?.(id), id),
          recordedAt: timestamp(),
        },
      ]),
    );
  }

  function snapshotGuilds() {
    return Object.fromEntries(
      Object.entries(getGuilds()).map(([id, guild]) => [
        id,
        {
          id,
          name: displayNameForGuild(guild, id),
          recordedAt: timestamp(),
        },
      ]),
    );
  }

  function findRemoved(previous, current) {
    return Object.values(previous ?? {}).filter((entity) => !current[entity.id]);
  }

  function saveSnapshot(friends, guilds) {
    storage.friends = friends;
    storage.guilds = guilds;
    storage.lastScanAt = timestamp();
  }

  function findNotificationModule() {
    const candidates = [
      metro.findByProps?.("displayNotification"),
      metro.findByProps?.("showNotification"),
      metro.findByProps?.("presentLocalNotification"),
      metro.findByProps?.("localNotification"),
      ReactNative?.NativeModules?.Notifications,
      ReactNative?.NativeModules?.NotificationManager,
    ];

    const methods = [
      "displayNotification",
      "showNotification",
      "presentLocalNotification",
      "localNotification",
      "scheduleLocalNotification",
      "notify",
    ];

    for (const module of candidates) {
      if (!module) continue;

      for (const method of methods) {
        if (typeof module[method] === "function") return { module, method };
      }
    }
  }

  function notificationText(kind, entity) {
    if (kind === "friend") {
      return {
        title: "Friend removed",
        body: `${entity.name} is no longer in your friends list.`,
      };
    }

    return {
      title: "Server removed",
      body: `You are no longer in ${entity.name}.`,
    };
  }

  function notify(kind, entity) {
    const { title, body } = notificationText(kind, entity);
    const payload = {
      title,
      body,
      message: body,
      channelId: NOTIFICATION_CHANNEL_ID,
      identifier: `${NOTIFICATION_CHANNEL_ID}-${kind}-${entity.id}-${timestamp()}`,
      smallIcon: "ic_notification",
      userInfo: {
        plugin: NOTIFICATION_CHANNEL_ID,
        kind,
        id: entity.id,
      },
    };

    try {
      const notificationModule = findNotificationModule();
      if (notificationModule) {
        notificationModule.module[notificationModule.method].call(notificationModule.module, payload);
        return;
      }
    } catch (error) {
      logger.warn?.(`[${PLUGIN_NAME}] Native notification failed`, error);
    }

    showToast(`${title}: ${body}`);
  }

  function scan({ silent = false } = {}) {
    ensureStorage();

    const friends = snapshotFriends();
    const guilds = snapshotGuilds();

    if (!storage.initializedAt) {
      storage.initializedAt = timestamp();
      saveSnapshot(friends, guilds);
      logger.log?.(`[${PLUGIN_NAME}] Stored initial relationship baseline.`);
      return;
    }

    if (!silent) {
      if (storage.notifyOnUnfriends) {
        for (const friend of findRemoved(storage.friends, friends)) notify("friend", friend);
      }

      if (storage.notifyOnGuildRemoval) {
        for (const guild of findRemoved(storage.guilds, guilds)) notify("guild", guild);
      }
    }

    saveSnapshot(friends, guilds);
  }

  function scheduleScan(options) {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => scan(options), RESCAN_DELAY_MS);
  }

  function eventId(event) {
    return event?.relationship?.id ?? event?.user?.id ?? event?.userId ?? event?.guild?.id ?? event?.guildId ?? event?.id;
  }

  function handleRelationshipRemove(event) {
    const id = eventId(event);
    const friend = id ? storage.friends?.[id] : undefined;

    if (storage.notifyOnUnfriends && friend) {
      notify("friend", friend);
      delete storage.friends[id];
    }

    scheduleScan({ silent: true });
  }

  function handleGuildDelete(event) {
    if (event?.guild?.unavailable || event?.unavailable) {
      scheduleScan({ silent: true });
      return;
    }

    const id = eventId(event);
    const guild = id ? storage.guilds?.[id] : undefined;

    if (storage.notifyOnGuildRemoval && guild) {
      notify("guild", guild);
      delete storage.guilds[id];
    }

    scheduleScan({ silent: true });
  }

  function subscribe(event, handler) {
    FluxDispatcher?.subscribe?.(event, handler);
    subscriptions.push([event, handler]);
  }

  function unsubscribeAll() {
    for (const [event, handler] of subscriptions.splice(0)) {
      FluxDispatcher?.unsubscribe?.(event, handler);
    }
  }

  function resyncBaseline() {
    scan({ silent: true });
    showToast(`${PLUGIN_NAME}: baseline refreshed.`);
  }

  return {
    onLoad() {
      ensureStorage();
      subscribe("RELATIONSHIP_REMOVE", handleRelationshipRemove);
      subscribe("GUILD_DELETE", handleGuildDelete);
      subscribe("CONNECTION_OPEN", () => scheduleScan({ silent: true }));
      scan({ silent: false });
      scanTimer = setInterval(scan, SCAN_INTERVAL_MS);
    },

    onUnload() {
      unsubscribeAll();
      clearInterval(scanTimer);
      clearTimeout(rescanTimer);
      scanTimer = undefined;
      rescanTimer = undefined;
    },

    resyncBaseline,
  };
})();
