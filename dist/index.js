(() => {
  const PLUGIN_NAME = "Relationship Notifier";
  const STORAGE_VERSION = 4;
  const FRIEND_TYPE = 1;
  const SCAN_EVERY_MS = 60_000;
  const DEBOUNCE_MS = 750;
  const MAX_CHANGES = 250;
  const CHANNEL_ID = "relationship-notifier";

  const { metro, plugin, ui } = vendetta;
  const storage = plugin.storage;
  const React = metro.common?.React;
  const ReactNative = metro.common?.ReactNative;
  const FluxDispatcher = metro.common?.FluxDispatcher;
  const showToast = ui?.toasts?.showToast ?? (() => undefined);

  let interval;
  let debounce;
  const listeners = [];

  const byStore = (name, ...props) => metro.findByStoreName?.(name) ?? metro.findByProps?.(...props);
  const RelationshipStore = byStore("RelationshipStore", "getRelationships");
  const UserStore = byStore("UserStore", "getUser");
  const GuildStore = byStore("GuildStore", "getGuilds");

  function ensureStorage() {
    if (storage.version !== STORAGE_VERSION) {
      storage.ready = false;
      storage.changes = [];
    }
    storage.version = STORAGE_VERSION;
    storage.friends ??= {};
    storage.guilds ??= {};
    storage.ready ??= false;
    storage.lastScanAt ??= 0;
    storage.changes ??= [];
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
    if (!RelationshipStore || (!RelationshipStore.getFriendIDs && !RelationshipStore.getFriendIds && !RelationshipStore.getRelationships)) return null;
    const seenAt = Date.now();
    return Object.fromEntries(
      friendIds().map((id) => [id, { id, label: labelUser(UserStore?.getUser?.(id), id), seenAt }]),
    );
  }

  function currentGuilds() {
    if (typeof GuildStore?.getGuilds !== "function") return null;
    const seenAt = Date.now();
    const guilds = GuildStore.getGuilds();

    return Object.fromEntries(
      Object.entries(guilds).map(([id, guild]) => [id, { id, label: labelGuild(guild, id), seenAt }]),
    );
  }

  function compare(kind, previous, next) {
    const changedAt = Date.now();
    const changes = [];

    for (const entry of Object.values(next)) {
      if (!previous?.[entry.id]) {
        changes.push({ ...entry, kind, action: "added", changedAt, changeId: `${kind}:added:${entry.id}:${changedAt}` });
      }
    }

    for (const entry of Object.values(previous ?? {})) {
      if (!next[entry.id]) {
        changes.push({ ...entry, kind, action: "removed", changedAt, changeId: `${kind}:removed:${entry.id}:${changedAt}` });
      }
    }

    return changes;
  }

  function notificationText(change) {
    if (change.kind === "friend") {
      return {
        title: change.action === "added" ? "Mutual added" : "Mutual removed",
        body:
          change.action === "added"
            ? `${change.label} is now in your friends list.`
            : `${change.label} removed you from their friends list.`,
      };
    }

    return {
      title: change.action === "added" ? "Server added" : "Server removed",
      body: change.action === "added" ? `You were added to ${change.label}.` : `You were removed from ${change.label}.`,
    };
  }

  async function callMaybeAsync(target, method, payload) {
    return await Promise.resolve(target[method](payload));
  }

  function notificationTargets() {
    const nativeModules = ReactNative?.NativeModules ?? {};
    const directCandidates = [
      metro.findByProps?.("displayNotification"),
      metro.findByProps?.("showNotification"),
      metro.findByProps?.("presentLocalNotification"),
      metro.findByProps?.("localNotification"),
      metro.findByProps?.("requestPermission", "displayNotification"),
      metro.findByProps?.("createChannel", "displayNotification"),
      nativeModules.Notifications,
      nativeModules.NotificationManager,
      nativeModules.PushNotificationManager,
      nativeModules.PushNotificationIOS,
    ];
    const dynamicCandidates = Object.values(nativeModules).filter((module) =>
      ["displayNotification", "showNotification", "presentLocalNotification", "localNotification", "notify"].some(
        (method) => typeof module?.[method] === "function",
      ),
    );

    return [...directCandidates, ...dynamicCandidates].filter(Boolean);
  }

  async function notify(change, { tryAll = false } = {}) {
    const { title, body } = notificationText(change);
    const flatPayload = {
      title,
      body,
      message: body,
      channelId: CHANNEL_ID,
      identifier: change.changeId,
      smallIcon: "ic_notification",
    };
    const notifeePayload = {
      title,
      body,
      data: { plugin: CHANNEL_ID, kind: change.kind, action: change.action, id: change.id },
      android: { channelId: CHANNEL_ID, smallIcon: "ic_notification", pressAction: { id: "default" } },
      ios: { sound: "default" },
    };
    const localPayload = {
      ...flatPayload,
      alertTitle: title,
      alertBody: body,
      alertAction: "view",
      soundName: "default",
      userInfo: { plugin: CHANNEL_ID, kind: change.kind, action: change.action, id: change.id },
    };

    for (const target of notificationTargets()) {
      try {
        if (typeof target.requestPermission === "function") await callMaybeAsync(target, "requestPermission");
        if (typeof target.requestPermissions === "function") await callMaybeAsync(target, "requestPermissions");
        if (typeof target.createChannel === "function") {
          await callMaybeAsync(target, "createChannel", { id: CHANNEL_ID, name: PLUGIN_NAME, importance: 4 });
        }

        if (typeof target.displayNotification === "function") {
          await callMaybeAsync(target, "displayNotification", notifeePayload);
          if (!tryAll) return;
        }
        if (typeof target.showNotification === "function") {
          await callMaybeAsync(target, "showNotification", flatPayload);
          if (!tryAll) return;
        }
        if (typeof target.presentLocalNotification === "function") {
          await callMaybeAsync(target, "presentLocalNotification", localPayload);
          if (!tryAll) return;
        }
        if (typeof target.localNotification === "function") {
          await callMaybeAsync(target, "localNotification", localPayload);
          if (!tryAll) return;
        }
        if (typeof target.notify === "function") {
          await callMaybeAsync(target, "notify", flatPayload);
          if (!tryAll) return;
        }
      } catch {}
    }
  }


  function recordChanges(changes) {
    if (!changes.length) return;
    storage.changes = [...changes, ...(storage.changes ?? [])].slice(0, MAX_CHANGES);
    changes.forEach((change) => void notify(change));
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

    if (!friends || !guilds) return false;

    if (storage.ready && !silent) {
      if ((Object.keys(storage.friends ?? {}).length && !Object.keys(friends).length) || (Object.keys(storage.guilds ?? {}).length && !Object.keys(guilds).length)) {
        return false;
      }
      recordChanges([...compare("friend", storage.friends, friends), ...compare("guild", storage.guilds, guilds)]);
    }

    writeSnapshot(friends, guilds);
    return true;
  }

  function scheduleScan({ silent = false } = {}) {
    clearTimeout(debounce);
    debounce = setTimeout(() => scan({ silent }), DEBOUNCE_MS);
  }

  function subscribe(event, handler) {
    FluxDispatcher?.subscribe?.(event, handler);
    listeners.push([event, handler]);
  }

  function unsubscribeAll() {
    for (const [event, handler] of listeners.splice(0)) FluxDispatcher?.unsubscribe?.(event, handler);
  }

  function matchesFilter(change, filter) {
    if (filter === "all") return true;
    if (filter === "friend" || filter === "guild") return change.kind === filter;
    const [kind, action] = filter.split("-");
    return change.kind === kind && change.action === action;
  }

  function sendTestNotification() {
    showToast(`${PLUGIN_NAME}: sending test notification...`);
    void notify({
      id: "test",
      label: PLUGIN_NAME,
      seenAt: Date.now(),
      changeId: `test:${Date.now()}`,
      kind: "friend",
      action: "removed",
      changedAt: Date.now(),
    }, { tryAll: true });
  }

  function ChangeLogSettings() {
    ensureStorage();
    const [filter, setFilter] = React.useState("all");
    const [, rerender] = React.useState(0);
    const changes = (storage.changes ?? []).filter((change) => matchesFilter(change, filter));
    const filters = [
      ["all", "All"],
      ["friend", "Mutuals"],
      ["friend-added", "Mutual adds"],
      ["friend-removed", "Mutual removals"],
      ["guild", "Servers"],
      ["guild-added", "Server adds"],
      ["guild-removed", "Server removals"],
    ];
    const clearLogs = () => {
      storage.changes = [];
      rerender((value) => value + 1);
      showToast(`${PLUGIN_NAME}: logs wiped.`);
    };
    const formatTime = (timestamp) =>
      new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium", timeZoneName: "short" }).format(new Date(timestamp));
    const e = React.createElement;
    const { ScrollView, View, Text, Pressable } = ReactNative;

    return e(
      ScrollView,
      { style: { padding: 16 } },
      e(Text, { style: { color: "white", fontSize: 22, fontWeight: "700", marginBottom: 8 } }, PLUGIN_NAME),
      e(Text, { style: { color: "#b9bbbe", marginBottom: 12 } }, "Review every recorded mutual and server addition or removal."),
      e(
        Pressable,
        { onPress: sendTestNotification, style: { backgroundColor: "#5865f2", borderRadius: 12, padding: 12, marginBottom: 12 } },
        e(Text, { style: { color: "white", fontWeight: "700", textAlign: "center" } }, "Send test notification"),
      ),
      e(
        Pressable,
        { onPress: clearLogs, style: { backgroundColor: "#4f3336", borderRadius: 12, padding: 12, marginBottom: 12 } },
        e(Text, { style: { color: "white", fontWeight: "700", textAlign: "center" } }, "Wipe logs"),
      ),
      e(
        View,
        { style: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 } },
        ...filters.map(([value, label]) =>
          e(
            Pressable,
            {
              key: value,
              onPress: () => setFilter(value),
              style: {
                backgroundColor: filter === value ? "#5865f2" : "#2f3136",
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 8,
              },
            },
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
              e(Text, { style: { color: "#8e9297", fontSize: 12 } }, formatTime(change.changedAt)),
            );
          })
        : e(Text, { style: { color: "#b9bbbe" } }, "No changes recorded for this filter yet."),
    );
  }

  return {
    onLoad() {
      ensureStorage();
      subscribe("RELATIONSHIP_ADD", () => scheduleScan());
      subscribe("RELATIONSHIP_REMOVE", () => scheduleScan());
      subscribe("GUILD_CREATE", () => scheduleScan());
      subscribe("GUILD_DELETE", () => scheduleScan());
      subscribe("CONNECTION_OPEN", () => scheduleScan({ silent: true }));
      scan({ silent: true });
      interval = setInterval(scan, SCAN_EVERY_MS);
    },

    onUnload() {
      unsubscribeAll();
      clearInterval(interval);
      clearTimeout(debounce);
      interval = undefined;
      debounce = undefined;
    },

    settings: ChangeLogSettings,

    resyncBaseline() {
      scan({ silent: true });
      showToast(`${PLUGIN_NAME}: baseline refreshed.`);
    },
  };
})();
