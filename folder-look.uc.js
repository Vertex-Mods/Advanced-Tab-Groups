// ==UserScript==
// @name         Advanced Tab Groups — Folder Look
// @description  Gives Advanced Tab Groups headers Zen's native folder icon and open/close/active states
// @author       imthi
// ==/UserScript==
// Toggled by the browser.tabs.groups.folder-look pref; folder-look.css gates on the same pref.

(function () {
  // Sine re-runs .uc.js on every rebuild: tear down the previous instance first
  window.atgFolderLook?.destroy();

  const PREF = "browser.tabs.groups.folder-look";
  Services.prefs.getDefaultBranch("").setBoolPref(PREF, true);

  const ATTR = "atg-folder-look";
  const XHTML_NS = "http://www.w3.org/1999/xhtml";

  const isPlainGroup = el => el?.localName === "tab-group" && !el.hasAttribute("split-view-group");

  function iconTemplate() {
    return customElements.get("zen-folder")?.rawIcon ?? null;
  }

  // ---- Active tabs (Zen folder semantics) ----
  // A collapsed group keeps showing the tabs that were selected when it collapsed or got selected
  // while collapsed, until they are unloaded or the group expands; nested groups holding one stay
  // visible too. The marker attribute drives the CSS here and the tree-connector mod's checks.
  const ACTIVE_ATTR = "atg-folder-active";
  const COLLAPSED_GROUP = "tab-group[collapsed]:not([split-view-group])";

  const isSelectedLike = tab =>
    tab.selected || (tab.group?.hasAttribute("split-view-group") && !!tab.group.querySelector("tab[selected]"));

  function markSelectedTabs(group) {
    for (const tab of group.querySelectorAll("tab")) {
      if (isSelectedLike(tab)) tab.setAttribute(ACTIVE_ATTR, "true");
    }
  }

  function onCollapsedChanged(group) {
    if (group.hasAttribute("collapsed")) {
      markSelectedTabs(group);
    } else {
      // Marks survive only for tabs still under some other collapsed ancestor
      for (const tab of group.querySelectorAll(`tab[${ACTIVE_ATTR}]`)) {
        if (!tab.closest(COLLAPSED_GROUP)) tab.removeAttribute(ACTIVE_ATTR);
      }
    }
    updateStateWithAncestors(group);
  }

  function updateStateWithAncestors(el) {
    let group = isPlainGroup(el) ? el : el.closest("tab-group:not([split-view-group])");
    while (group) {
      updateState(group);
      group = group.parentElement?.closest("tab-group:not([split-view-group])") ?? null;
    }
  }

  function updateState(group) {
    const svg = group.querySelector(":scope > .tab-group-label-container > .tab-group-folder-icon > svg");
    if (!svg) return;
    const collapsed = group.hasAttribute("collapsed");
    svg.setAttribute("state", collapsed ? "close" : "open");
    // Zen shows the dots only while collapsed with an active tab inside
    const hasActive = collapsed && !!group.querySelector(`tab[selected], tab[${ACTIVE_ATTR}]`);
    svg.setAttribute("active", hasActive ? "true" : "false");
  }

  function decorate(group) {
    if (!isPlainGroup(group)) return;
    const label = group.querySelector(":scope > .tab-group-label-container");
    if (!label) return;
    // A group restored collapsed with the selected tab inside starts out with that tab active
    if (group.hasAttribute("collapsed")) markSelectedTabs(group);

    if (!label.querySelector(":scope > .tab-group-folder-icon")) {
      const template = iconTemplate();
      if (!template) return;
      const holder = document.createElementNS(XHTML_NS, "div");
      holder.className = "tab-group-folder-icon";
      holder.appendChild(template.cloneNode(true));
      label.prepend(holder);
    }

    group.setAttribute(ATTR, "true");
    updateState(group);
  }

  // ---- Zen Library (Spaces tab) ----
  // ATG renders its groups in the Library as .library-workspace-tab-group wrappers with a
  // .library-workspace-item.atg-tab-group header; give that header the same folder icon.
  // Own <link> for the rules: ATG's zen-library.css only reaches the shadow root through ATG's
  // Library patch, which zen-library blocks when zen.library.compat.advanced-tab-groups is on.
  const LIBRARY_STYLE_ID = "atg-folder-look-library-styles";
  const LIBRARY_CSS_URL = (() => {
    try {
      return Components.stack.filename.replace(/[^/\\]*\.uc\.js(\?.*)?$/i, "folder-look.library.css");
    } catch (e) {
      return null;
    }
  })();

  function updateLibraryState(wrapper) {
    const svg = wrapper.querySelector(":scope > .library-workspace-item.atg-tab-group > .tab-group-folder-icon > svg");
    if (!svg) return;
    const collapsed = wrapper.classList.contains("collapsed");
    svg.setAttribute("state", collapsed ? "close" : "open");
    // ATG marks the header .selected when the group holds the selected tab; our marker covers the rest
    const header = wrapper.querySelector(":scope > .library-workspace-item.atg-tab-group");
    const hasActive = collapsed && (header.classList.contains("selected") || !!wrapper.querySelector(`.library-workspace-item.${ACTIVE_ATTR}`));
    svg.setAttribute("active", hasActive ? "true" : "false");
  }

  function decorateLibrary(root) {
    for (const wrapper of root.querySelectorAll(".library-workspace-tab-group")) {
      const header = wrapper.querySelector(":scope > .library-workspace-item.atg-tab-group");
      if (!header) continue;
      if (!header.querySelector(":scope > .tab-group-folder-icon")) {
        const template = iconTemplate();
        if (!template) return;
        const holder = document.createElementNS(XHTML_NS, "span");
        holder.className = "tab-group-folder-icon folder-icon";
        holder.appendChild(template.cloneNode(true));
        header.prepend(holder);
      }
      wrapper.setAttribute(ATTR, "true");
      // Rows for active tabs, and nested headers holding one, stay visible under a collapsed group
      for (const row of wrapper.querySelectorAll(".library-workspace-item:not(.atg-tab-group)")) {
        row.classList.toggle(ACTIVE_ATTR, !!row._libraryDropItem?.hasAttribute?.(ACTIVE_ATTR));
      }
      for (const nested of wrapper.querySelectorAll(".library-workspace-tab-group")) {
        const nestedHeader = nested.querySelector(":scope > .library-workspace-item.atg-tab-group");
        nestedHeader?.classList.toggle(ACTIVE_ATTR, !!nested.querySelector(`.library-workspace-item.${ACTIVE_ATTR}:not(.atg-tab-group)`));
      }
      updateLibraryState(wrapper);
    }
  }

  let libraryRoot = null;
  let libraryObserver = null;
  let libraryRaf = null;

  function attachLibrary() {
    const root = document.querySelector("zen-library")?.shadowRoot;
    if (root === libraryRoot) return;
    libraryObserver?.disconnect();
    libraryObserver = null;
    libraryRoot = root ?? null;
    if (!root) return;

    if (LIBRARY_CSS_URL && !root.getElementById(LIBRARY_STYLE_ID)) {
      const link = document.createElement("link");
      link.id = LIBRARY_STYLE_ID;
      link.rel = "stylesheet";
      link.href = LIBRARY_CSS_URL;
      root.appendChild(link);
    }

    const schedule = () => {
      if (libraryRaf !== null) return;
      libraryRaf = requestAnimationFrame(() => {
        libraryRaf = null;
        if (libraryRoot) decorateLibrary(libraryRoot);
      });
    };
    libraryObserver = new MutationObserver(schedule);
    libraryObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    schedule();
  }

  let rafId = null;
  function refreshAll() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      for (const group of gBrowser.tabContainer.querySelectorAll("tab-group:not([split-view-group])")) {
        decorate(group);
      }
    });
  }

  // ---- Lifecycle ----
  let running = false;
  let tabObserver = null;
  let browserObserver = null;
  const listeners = [];

  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    listeners.push([target, type, handler]);
  }

  function start() {
    if (running) return;
    running = true;
    const container = gBrowser.tabContainer;

    tabObserver = new MutationObserver(mutations => {
      let structural = false;
      for (const m of mutations) {
        if (m.type === "childList") { structural = true; continue; }
        if (m.attributeName === "collapsed" && isPlainGroup(m.target)) onCollapsedChanged(m.target);
      }
      if (structural) refreshAll();
    });
    tabObserver.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["collapsed"] });

    // Selecting a tab inside a collapsed group makes it (and its split-view siblings) active there
    listen(container, "TabSelect", event => {
      const tab = event.target;
      if (tab?.closest?.(COLLAPSED_GROUP)) {
        const tabs = tab.group?.hasAttribute("split-view-group") ? tab.group.querySelectorAll("tab") : [tab];
        for (const t of tabs) t.setAttribute(ACTIVE_ATTR, "true");
      }
      for (const group of container.querySelectorAll(`tab-group[${ATTR}]`)) updateState(group);
    });
    // Unloading (or closing) an active tab drops it from the collapsed view, like Zen's unload
    listen(container, "TabBrowserDiscarded", event => {
      event.target?.removeAttribute?.(ACTIVE_ATTR);
      updateStateWithAncestors(event.target);
    });
    listen(container, "TabClose", () => {
      for (const group of container.querySelectorAll(`tab-group[${ATTR}]`)) updateState(group);
    });
    listen(window, "TabGroupCreate", refreshAll);

    // The Library host is created on every open and dropped on close
    const browser = document.getElementById("browser");
    if (browser) {
      browserObserver = new MutationObserver(attachLibrary);
      browserObserver.observe(browser, { childList: true });
      attachLibrary();
    }

    refreshAll();
  }

  function stop() {
    if (!running) return;
    running = false;
    tabObserver?.disconnect();
    browserObserver?.disconnect();
    libraryObserver?.disconnect();
    tabObserver = browserObserver = libraryObserver = null;
    libraryRoot = null;
    for (const [target, type, handler] of listeners.splice(0)) target.removeEventListener(type, handler);
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (libraryRaf !== null) cancelAnimationFrame(libraryRaf);
    rafId = libraryRaf = null;

    // Strip only our holders: native zen-folders share the class and Zen never rebuilds their icon once it is gone
    const shadow = document.querySelector("zen-library")?.shadowRoot;
    shadow?.getElementById(LIBRARY_STYLE_ID)?.remove();
    const roots = [gBrowser.tabContainer, shadow].filter(Boolean);
    for (const root of roots) {
      for (const el of root.querySelectorAll(`[${ATTR}] > :is(.tab-group-label-container, .library-workspace-item.atg-tab-group) > .tab-group-folder-icon`)) el.remove();
      for (const el of root.querySelectorAll(`[${ATTR}]`)) el.removeAttribute(ATTR);
      for (const el of root.querySelectorAll(`[${ACTIVE_ATTR}]`)) el.removeAttribute(ACTIVE_ATTR);
      for (const el of root.querySelectorAll(`.${ACTIVE_ATTR}`)) el.classList.remove(ACTIVE_ATTR);
    }
  }

  function onPrefChange() {
    if (Services.prefs.getBoolPref(PREF, true)) start();
    else stop();
  }

  let destroyed = false;
  let observingPref = false;
  function init() {
    if (destroyed) return;
    Services.prefs.addObserver(PREF, onPrefChange);
    observingPref = true;
    // The pref service is process-wide: an observer left behind keeps this whole window alive
    window.addEventListener("unload", () => window.atgFolderLook?.destroy(), { once: true });
    onPrefChange();
  }

  window.atgFolderLook = {
    destroy() {
      destroyed = true;
      if (observingPref) Services.prefs.removeObserver(PREF, onPrefChange);
      observingPref = false;
      stop();
      if (window.atgFolderLook === this) delete window.atgFolderLook;
    },
  };

  async function bootstrap() {
    if (!window.gBrowser || !window.gZenWorkspaces) {
      document.addEventListener("DOMContentLoaded", () => bootstrap().catch(console.error), { once: true });
      return;
    }
    await customElements.whenDefined("zen-folder");
    if (window.gZenWorkspaces.promiseInitialized) await window.gZenWorkspaces.promiseInitialized;
    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bootstrap().catch(console.error), { once: true });
  } else {
    queueMicrotask(() => bootstrap().catch(console.error));
  }
})();
