(() => {
  const PLUGIN_NAME = "Relationship Notifier";
  const STORAGE_VERSION = 2;
  const FRIEND_TYPE = 1;
  const SCAN_EVERY_MS = 60_000;
  const DEBOUNCE_MS = 1_000;
  const CHANNEL_ID = "relationship-notifier";

  const { metro, plugin, ui, logger = console } = vendetta;
  const storage = plugin.storage;
  const FluxDispatcher = metro.common?.FluxDispatcher;
  const ReactNative = metro.common?.ReactNative;
  const showToast = ui?.toasts?.showToast ?? (() => undefined);

  let interval;
  let debounce;
  const listeners = [];

  const byStore = (name, ...props) => metro.findByStoreName?.(name) ?? metro.findByProps?.(...props);
  const RelationshipStore = byStore("RelationshipStore", "getRelationships");
  const UserStore = byStore("UserStore", "getUser");
  const GuildStore = byStore("GuildStore", "getGuilds");

  function ensureStorage() {
    storage.version = STORAGE_VERSION;
    storage.friends ??= {};
    storage.guilds ??= {};
    storage.ready ??= false;
    storage.lastScanAt ??= 0;
  }

  function labelUser(user, id) {
    return user?.globalName ?? user?.global_name ?? user?.displayName ?? user?.username ?? user?.tag ?? id;
  }

  function labelGuild(guild, id) {
    return guild?.name ?? guild?.properties?.name ?? id;
  }

  function friendIds() {
    if (typeof RelationshipStore?.getFriendIDs === "function") return RelationshipStore.getFriendIDs();
    if (typeof RelationshipStore?.getFriendIds === "function") return RelationshipStore.getFriendIds();

    const relationships =
      typeof RelationshipStore?.getRelationships === "function" ? RelationshipStore.getRelationships() : {};

    return Object.entries(relationships)
      .filter(([, relationship]) => relationship === FRIEND_TYPE)
      .map(([id]) => id);
  }

  function currentFriends() {
    const seenAt = Date.now();
    return Object.fromEntries(
      friendIds().map((id) => [id, { id, label: labelUser(UserStore?.getUser?.(id), id), seenAt }]),
    );
  }

  function currentGuilds() {
    const seenAt = Date.now();
    const guilds = typeof GuildStore?.getGuilds === "function" ? GuildStore.getGuilds() : {};

    return Object.fromEntries(
      Object.entries(guilds).map(([id, guild]) => [id, { id, label: labelGuild(guild, id), seenAt }]),
    );
  }

  function removals(kind, previous, next) {
    return Object.values(previous ?? {})
      .filter((entry) => !next[entry.id])
      .map((entry) => ({ kind, entry }));
  }

  function notificationModule() {
    const modules = [
      metro.findByProps?.("displayNotification"),
      metro.findByProps?.("showNotification"),
      metro.findByProps?.("presentLocalNotification"),
      ReactNative?.NativeModules?.Notifications,
    ];
    const methods = ["displayNotification", "showNotification", "presentLocalNotification", "localNotification", "notify"];

    for (const module of modules) {
      for (const method of methods) {
        if (typeof module?.[method] === "function") return { module, method };
      }
    }
  }

  function notify(removal) {
    const isFriend = removal.kind === "friend";
    const title = isFriend ? "Friend removed" : "Server removed";
    const body = isFriend
      ? `${removal.entry.label} is no longer in your friends list.`
      : `You are no longer in ${removal.entry.label}.`;

    try {
      const target = notificationModule();
      if (target) {
        target.module[target.method].call(target.module, {
          title,
          body,
          message: body,
          channelId: CHANNEL_ID,
          identifier: `${CHANNEL_ID}-${removal.kind}-${removal.entry.id}-${Date.now()}`,
          smallIcon: "ic_notification",
        });
        return;
      }
    } catch (error) {
      logger.warn?.(`[${PLUGIN_NAME}] Failed to show native notification`, error);
    }

    showToast(`${title}: ${body}`);
  }

  function writeSnapshot(friends, guilds) {
    storage.friends = friends;
    storage.guilds = guilds;
    storage.ready = true;
    storage.lastScanAt = Date.now();
  }

  function scan({ silent = false } = {}) {
    ensureStorage();
    const friends = currentFriends();
    const guilds = currentGuilds();

    if (storage.ready && !silent) {
      for (const removal of [...removals("friend", storage.friends, friends), ...removals("guild", storage.guilds, guilds)]) {
        notify(removal);
      }
    }

    writeSnapshot(friends, guilds);
  }

  function scheduleSilentScan() {
    clearTimeout(debounce);
    debounce = setTimeout(() => scan({ silent: true }), DEBOUNCE_MS);
  }

  function eventId(event) {
    return event?.relationship?.id ?? event?.user?.id ?? event?.userId ?? event?.guild?.id ?? event?.guildId ?? event?.id;
  }

  function handleRelationshipRemove(event) {
    const entry = storage.friends?.[eventId(event)];
    if (entry) notify({ kind: "friend", entry });
    scheduleSilentScan();
  }

  function handleGuildDelete(event) {
    if (event?.guild?.unavailable || event?.unavailable) {
      scheduleSilentScan();
      return;
    }

    const entry = storage.guilds?.[eventId(event)];
    if (entry) notify({ kind: "guild", entry });
    scheduleSilentScan();
  }

  function subscribe(event, handler) {
    FluxDispatcher?.subscribe?.(event, handler);
    listeners.push([event, handler]);
  }

  function unsubscribeAll() {
    for (const [event, handler] of listeners.splice(0)) FluxDispatcher?.unsubscribe?.(event, handler);
  }

  return {
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
      clearInterval(interval);
      clearTimeout(debounce);
      interval = undefined;
      debounce = undefined;
    },

    resyncBaseline() {
      scan({ silent: true });
      showToast(`${PLUGIN_NAME}: baseline refreshed.`);
    },
  };
})();
