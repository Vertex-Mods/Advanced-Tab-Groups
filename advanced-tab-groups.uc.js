// ==UserScript==
// @name           Advanced Tab Groups
// @ignorecache
// ==/UserScript==
/* ==== Tab groups ==== */
/* https://github.com/Anoms12/Advanced-Tab-Groups */
/* ======= v3.9.1 ======= */

// Resolved once at load so the Zen Library shadowRoot <link> below can find
// its sibling stylesheet even when this method runs much later.
globalThis._advancedTabGroupsCssPath = (() => {
  try {
    return Components.stack.filename;
  } catch {
    return null;
  }
})();

class AdvancedTabGroups {
  #initTabGroupListener;

  constructor() {
    this.init();
  }

  async init() {
    // Wait for any dependencies before proceeding.
    await this.waitForDependencies();

    // Start the bundled Tabler pack before any saved icons are handed to
    // groups: an <image> pointing at resource://atg-tabler/* before its
    // substitution is registered renders broken.
    // applySavedIcons / applyGroupIcon additionally gate per icon URL
    // (see ensureAtgCustomIconsReady).
    try {
      if (this.atgTablerAvailable()) {
        this.setupAtgTablerPack();
      }
    } catch (_) {}

    // Load saved tab group settings
    this.applySavedColors();
    this.applySavedIcons();
    this.applySavedParents();
    this.applySavedCollapsedStates();

    // Set up observer for all tab groups
    this.setupObserver();
    this.setupDragAndDropSync();
    this.setupGroupDropTargeting();

    // Add folder context menu item
    this.addFolderContextMenuItems();

    // Make Zen Library render ATG tab groups differently from folders.
    this.setupZenLibraryIntegration();

    // Render ATG groups (with icons/colors) in Library spaces-section cards.
    this.setupZenLibrarySpacesSectionIntegration();

    // Remove built-in tab group editor menus if they exist
    this.removeBuiltinTabGroupMenu();

    // Searchable icon picker (Zen + Tabler via zia-extended-icons when
    // present) with custom upload support (fixes #156).
    this.setupIconPickerIntegration();

    // Process existing groups
    this.processExistingGroups();

    // Also try again after a delay to catch any missed groups
    setTimeout(() => this.processExistingGroups(), 1000);

    // Apply saved collapsed states after groups are processed
    setTimeout(() => this.applySavedParents(), 1200);
    setTimeout(() => this.applySavedCollapsedStates(), 1500);

    // Listen for tab group creation events from the platform component
    document.addEventListener(
      "TabGroupCreate",
      this.onTabGroupCreate.bind(this)
    );
    // The native colour setter fires this; when another mod hands a group a native colour code,
    // drop our stale vars right away (see syncGroupColorVars)
    document.addEventListener("TabGroupUpdate", (event) => {
      const group = event.target;
      if (group?.localName === "tab-group" && this.hasNativeColor(group)) {
        this.syncGroupColorVars(group);
      }
    });
    // Zen fires this when a group empties, whatever closed it. Drop its persisted state here so
    // applySavedColors never waits (waitForElm observes the whole body) on an id that is gone.
    document.addEventListener("TabGroupRemoved", (event) => {
      const group = event.target;
      if (group?.localName === "tab-group" && !group.hasAttribute("split-view-group") && !this.isLibraryGroupCopy(group)) {
        this.removeSavedGroupState(group.id);
      }
    });

    // Set up workspace change observer to update group visibility
    this.setupWorkspaceObserver();

    // Initial update of group visibility
    setTimeout(() => this.updateGroupVisibility(), 500);
  }

  setupZenLibraryIntegration() {
    const patchZenLibrary = () => {
      const Spaces = window.ZenLibrarySpaces;
      const proto = Spaces?.prototype;
      if (!proto || proto._advancedTabGroupsPatched) {
        return Boolean(proto?._advancedTabGroupsPatched);
      }

      const originalRenderItemRecursive = proto.renderItemRecursive;
      if (typeof originalRenderItemRecursive !== "function") {
        return false;
      }

      proto._advancedTabGroupsPatched = true;
      proto._advancedTabGroupsRenderItemRecursive = originalRenderItemRecursive;

      proto.ensureAdvancedTabGroupsStyles = function () {
        const root = this.library?.shadowRoot;
        if (!root || root.getElementById("advanced-tab-groups-zen-library-styles")) {
          return;
        }

        const link = document.createElement("link");
        link.id = "advanced-tab-groups-zen-library-styles";
        link.rel = "stylesheet";
        try {
          const base =
            globalThis._advancedTabGroupsCssPath ||
            (typeof Components !== "undefined" ? Components.stack?.filename : null);
          if (base) {
            link.href = base.replace(/[^/\\]*\.uc\.js(\?.*)?$/i, "zen-library.css");
          }
        } catch (_) {}
        if (!link.href) {
          console.warn("[AdvancedTabGroups] Could not resolve zen-library.css path; library styles skipped");
          return;
        }
        root.appendChild(link);
      };

      proto.createAdvancedTabGroupsIconNode = function (group) {
        const iconWrapper = this.el("span", {
          className: "item-icon atg-tab-group-icon"
        });
        const sourceIcon = group.querySelector(
          ".tab-group-icon :is(.group-icon, label)"
        );

        if (sourceIcon) {
          iconWrapper.classList.add("has-custom-icon");
          iconWrapper.appendChild(sourceIcon.cloneNode(true));
        } else {
          iconWrapper.appendChild(
            this.el("span", { className: "atg-tab-group-icon-fallback" })
          );
        }

        const sourceContainer = group.querySelector(".tab-group-icon");
        if (sourceContainer?.getAttribute("zen-emoji-open") === "true") {
          iconWrapper.setAttribute("zen-emoji-open", "true");
        }

        return iconWrapper;
      };

      proto.getAdvancedTabGroupsLibraryColor = function (group) {
        if (!group?.id) {
          return "";
        }

        globalThis.advancedTabGroups?.syncGroupColorVars?.(group);

        const groupStyle = window.getComputedStyle(group);
        const docStyle = window.getComputedStyle(document.documentElement);
        return (
          groupStyle.getPropertyValue("--tab-group-color").trim() ||
          docStyle.getPropertyValue(`--tab-group-color-${group.id}`).trim() ||
          docStyle.getPropertyValue(`--tab-group-color-${group.id}-favicon`).trim()
        );
      };

      proto.getAdvancedTabGroupsLibraryStroke = function (group) {
        if (!group?.id) {
          return "";
        }

        globalThis.advancedTabGroups?.syncGroupColorVars?.(group);

        const groupStyle = window.getComputedStyle(group);
        const docStyle = window.getComputedStyle(document.documentElement);
        return (
          groupStyle.getPropertyValue("--tab-group-stroke").trim() ||
          docStyle.getPropertyValue(`--tab-group-color-${group.id}-invert`).trim() ||
          docStyle.getPropertyValue(`--tab-group-color-${group.id}-favicon-invert`).trim()
        );
      };

      proto.getAdvancedTabGroupsLibraryTextColor = function (group) {
        const label = group?.querySelector?.(".tab-group-label");
        const labelColor = label ? window.getComputedStyle(label).color : "";
        if (labelColor) {
          return labelColor;
        }

        const groupColor = group ? window.getComputedStyle(group).color : "";
        if (groupColor) {
          return groupColor;
        }

        return window.getComputedStyle(document.documentElement)
          .getPropertyValue("--tab-selected-textcolor")
          .trim();
      };

      proto.shouldShowAdvancedTabGroupsFolderButton = function () {
        try {
          return Services.prefs.getBoolPref("browser.tabs.groups.show-folder-button", false);
        } catch (_) {
          return false;
        }
      };

      proto.setAdvancedTabGroupsLibraryExpanded = function (group, groupEl, expanded) {
        if (!group || !groupEl) {
          return;
        }

        groupEl.classList.toggle("collapsed", !expanded);
        groupEl.toggleAttribute("collapsed", !expanded);
        groupEl.toggleAttribute("expanded", expanded);

        try {
          if (expanded) {
            group.removeAttribute("collapsed");
          } else {
            group.setAttribute("collapsed", "true");
          }
        } catch (err) {
          console.error("[AdvancedTabGroups] Error syncing library collapsed state:", err);
        }

        globalThis.advancedTabGroups?.saveGroupCollapsedState?.(group.id, !expanded);
        setTimeout(() => document.querySelector("zen-library")?.update?.(true), 180);
      };

      proto.renderAdvancedTabGroupsGroup = function (group, container, wsId) {
        this.ensureAdvancedTabGroupsStyles();

        const isArcLike =
          Services.prefs.getBoolPref("browser.tabs.groups.arc-style", false) ||
          Services.prefs.getBoolPref("tab.groups.fill-folders", false) ||
          Services.prefs.getBoolPref("tab.groups.theme-folders", false);
        const groupId = `advanced-tab-groups:${group.id || `${wsId}:${group.label}`}`;
        let isExpanded = !group.hasAttribute("collapsed");
        if (isArcLike) {
          isExpanded = true;
          this._folderExpansion.set(groupId, true);
        } else {
          this._folderExpansion.set(groupId, isExpanded);
        }

        const tabs = (group.tabs || []).filter(child => {
          const closestGroup = child.closest?.("tab-group");
          return !child.hasAttribute("cloned") &&
            !child.hasAttribute("zen-empty-tab") &&
            (!closestGroup || closestGroup === group);
        });
        const hasActive = tabs.some(tab => tab.selected);
        const groupColor = this.getAdvancedTabGroupsLibraryColor(group);
        const groupStroke = this.getAdvancedTabGroupsLibraryStroke(group);
        const textColor = this.getAdvancedTabGroupsLibraryTextColor(group);

        const groupEl = this.el("div", {
          className: `library-workspace-tab-group ${isExpanded ? "" : "collapsed"}`
        });
        groupEl.toggleAttribute("expanded", isExpanded);
        groupEl.toggleAttribute("collapsed", !isExpanded);
        if (groupColor) {
          groupEl.style.setProperty("--atg-tab-group-color", groupColor);
        }
        if (groupStroke && !groupStroke.includes("gradient")) {
          groupEl.style.setProperty("--atg-tab-group-stroke", groupStroke);
        }
        if (textColor) {
          groupEl.style.setProperty("--atg-tab-group-textcolor", textColor);
        }
        if (group.hasAttribute("show-grain")) {
          groupEl.setAttribute("show-grain", group.getAttribute("show-grain"));
        }
        const grain = group.style.getPropertyValue("--group-grain");
        if (grain) {
          groupEl.style.setProperty("--group-grain", grain);
        }

        const headerEl = this.el("div", {
          className: `library-workspace-item atg-tab-group ${hasActive ? "selected" : ""}`,
          onclick: event => {
            event.stopPropagation();
            if (isArcLike) {
              return;
            }

            const newlyExpanded = group.hasAttribute("collapsed");
            this._folderExpansion.set(groupId, newlyExpanded);
            this.setAdvancedTabGroupsLibraryExpanded(group, groupEl, newlyExpanded);
          }
        });

        headerEl.appendChild(this.createAdvancedTabGroupsIconNode(group));

        headerEl.appendChild(
          this.el("span", {
            className: "item-label",
            textContent: group.label || "Tab Group"
          })
        );

        if (this.shouldShowAdvancedTabGroupsFolderButton()) {
          const folderBtn = this.el("div", {
            className: "atg-tab-group-folder-button",
            title: "Convert to Folder",
            onclick: e => {
              e.stopPropagation();
              e.preventDefault();
              try {
                globalThis.advancedTabGroups?.convertGroupToFolder?.(group);
              } catch (err) {
                console.error("[AdvancedTabGroups] Error converting to folder from library:", err);
              }
              setTimeout(() => document.querySelector("zen-library")?.update?.(true), 200);
            }
          }, [this.el("div", { className: "icon-mask" })]);
          folderBtn.addEventListener("mousedown", e => {
            e.stopPropagation();
            e.preventDefault();
          });
          headerEl.appendChild(folderBtn);
        }

        const closeBtn = this.el("div", {
          className: "atg-tab-group-close-button",
          title: "Close Group",
          onclick: e => {
            e.stopPropagation();
            e.preventDefault();
            try {
              const atg = globalThis.advancedTabGroups;
              if (atg) {
                atg.removeSavedColor?.(group.id);
                atg.removeSavedIcon?.(group.id);
                atg.removeSavedParentTree?.(group.id);
                atg.removeSavedCollapsedState?.(group.id);
              }
              window.gBrowser?.removeTabGroup?.(group);
            } catch (err) {
              console.error("[AdvancedTabGroups] Error closing group from library:", err);
            }
            setTimeout(() => document.querySelector("zen-library")?.update?.(true), 200);
          }
        }, [this.el("div", { className: "icon-mask" })]);
        closeBtn.addEventListener("mousedown", e => {
          e.stopPropagation();
          e.preventDefault();
        });
        headerEl.appendChild(closeBtn);

        groupEl.appendChild(headerEl);

        const contentEl = this.el("div", {
          className: "library-workspace-tab-group-content"
        });
        tabs.forEach(tab => this.renderTab(tab, contentEl, wsId));
        Array.from(group.querySelectorAll(":scope > .tab-group-container > tab-group"))
          .filter(childGroup => !childGroup.hasAttribute("split-view-group"))
          .forEach(childGroup => this.renderAdvancedTabGroupsGroup(childGroup, contentEl, wsId));

        groupEl.appendChild(contentEl);
        container.appendChild(groupEl);
      };

      proto.renderItemRecursive = function (item, container, wsId) {
        const isRegularTabGroup =
          window.gBrowser.isTabGroup(item) &&
          !item.hasAttribute("split-view-group") &&
          !item.classList.contains("zen-folder") &&
          !item.hasAttribute("zen-folder") &&
          (item.localName === "tab-group" || item.tagName === "tab-group");

        if (isRegularTabGroup) {
          this.renderAdvancedTabGroupsGroup(item, container, wsId);
          return;
        }

        return originalRenderItemRecursive.call(this, item, container, wsId);
      };

      document.querySelector("zen-library")?.update?.(true);
      console.log("[AdvancedTabGroups] Zen Library group styling patched");
      return true;
    };

    if (patchZenLibrary()) {
      return;
    }

    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (patchZenLibrary() || attempts >= 120) {
        clearInterval(interval);
      }
    }, 500);
  }

  // ---- Zen Library spaces-section cards (per-space strips) ----
  // Upstream shallow-clones real tab-groups into each space card and fills
  // their rows itself, so ATG must not process those live copies (guarded in
  // processGroup/tabGroups) — but the clone drops ATG's light-DOM icon, so
  // cards would show groups with no icon. Mirror the real icon container
  // into each copy here, and keep it in sync when icons recolor.
  // Visibility comes from updateGroupVisibility using atg-ws-hidden (hiding
  // scoped to real strips in CSS) instead of `hidden`, which the section
  // skips when copying rows.
  setupZenLibrarySpacesSectionIntegration() {
    if (this._spacesSectionIntegrated) {
      return;
    }
    this._spacesSectionIntegrated = true;
    // The library host is dropped when the library closes, so resolve the
    // section lazily; card rebuilds after that are caught by setupObserver,
    // which queues a sync whenever section DOM lands.
    this.waitForElm("zen-library-spaces-section")
      .then(section => {
        try {
          this.syncSpacesSectionCopies(section);
        } catch (_) {}
      })
      .catch(() => {});
  }

  queueSpacesSectionSync(section = null) {
    if (this._spacesSectionQueued) {
      return;
    }
    this._spacesSectionQueued = true;
    requestAnimationFrame(() => {
      this._spacesSectionQueued = false;
      try {
        const root = section?.isConnected
          ? section
          : document.querySelector("zen-library-spaces-section");
        if (root) {
          this.syncSpacesSectionCopies(root);
        }
      } catch (error) {
        console.error("[AdvancedTabGroups] Error syncing spaces section copies:", error);
      }
    });
  }

  // Key for "does this copy still match the real icon": container markup
  // covers the icon node, its baked paint and the synced color vars.
  spacesSectionCopyIconKey(realIconContainer) {
    try {
      return realIconContainer?.outerHTML ?? "";
    } catch (_) {
      return "";
    }
  }

  syncSpacesSectionCopyIcon(copy, real) {
    try {
      const label = copy.querySelector(":scope > .tab-group-label-container");
      const realIcon = real.querySelector(":scope > .tab-group-label-container > .tab-group-icon-container");
      if (!label || !realIcon) {
        return;
      }
      const key = this.spacesSectionCopyIconKey(realIcon);
      const existing = label.querySelector(":scope > .tab-group-icon-container[data-atg-copy-icon]");
      if (existing) {
        if (existing.dataset.atgCopyIconKey === key) {
          return;
        }
        existing.remove();
      }
      if (!key) {
        return;
      }
      const iconClone = realIcon.cloneNode(true);
      iconClone.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
      iconClone.setAttribute("data-atg-copy-icon", "true");
      iconClone.dataset.atgCopyIconKey = key;
      label.prepend(iconClone);
    } catch (error) {
      console.error("[AdvancedTabGroups] Error syncing spaces section copy icon:", error);
    }
  }

  syncSpacesSectionCopies(section) {
    try {
      const root = section || document.querySelector("zen-library-spaces-section");
      if (!root) {
        return;
      }
      for (const copy of root.querySelectorAll('tab-group[id$="-copy"]')) {
        try {
          // Belt and suspenders with updateGroupVisibility: copies always
          // render in cards, never inherit workspace hiding.
          copy.removeAttribute("hidden");
          copy.removeAttribute("atg-ws-hidden");
          const realId = copy.id.slice(0, -"-copy".length);
          const real = realId ? this.getGroupById(realId) : null;
          if (!real || real.hasAttribute("split-view-group")) {
            continue;
          }
          this.syncSpacesSectionCopyIcon(copy, real);
        } catch (error) {
          console.error("[AdvancedTabGroups] Error syncing spaces section copy:", error);
        }
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error syncing spaces section copies:", error);
    }
  }

  // Icon recolors don't rebuild cards, so push them to copies directly.
  refreshSpacesSectionGroupIcon(group) {
    try {
      if (!group?.id || typeof document === "undefined") {
        return;
      }
      const copies = document.querySelectorAll(`zen-library-spaces-section tab-group[id="${group.id}-copy"]`);
      if (!copies.length) {
        return;
      }
      for (const copy of copies) {
        copy.removeAttribute("hidden");
        copy.removeAttribute("atg-ws-hidden");
        this.syncSpacesSectionCopyIcon(copy, group);
      }
    } catch (_) {}
  }

  setupObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Proactively remove Firefox built-in tab group editor menu if it appears
              if (
                node.id === "tab-group-editor" ||
                node.nodeName?.toLowerCase() === "tabgroup-meu" ||
                node.querySelector?.("#tab-group-editor, tabgroup-meu")
              ) {
                this.removeBuiltinTabGroupMenu(node);
              }
              // Check if the added node is a tab-group
              if (node.tagName === "tab-group") {
                // Skip split-view-groups
                if (!node.hasAttribute("split-view-group")) {
                  this.processGroup(node);
                }
              }
              // Check if any children are tab-groups
              const childGroups = node.querySelectorAll?.("tab-group") || [];
              childGroups.forEach((group) => {
                // Skip split-view-groups
                if (!group.hasAttribute("split-view-group")) {
                  this.processGroup(group);
                }
              });
              // Library spaces-section cards rebuild wholesale (and their
              // group copies connect as live elements) — sync ATG copy icons.
              if (
                node.matches?.("zen-library-spaces-section, .zen-library-space-tabs, tab-group") ||
                node.querySelector?.("zen-library-spaces-section, .zen-library-space-tabs")
              ) {
                this.queueSpacesSectionSync();
              }
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  waitForElm(selector) {
    return new Promise(resolve => {
      const el = document.querySelector(selector);
      if (el) {
        return resolve(el);
      }
    
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
    
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  waitForDependencies() {
    return new Promise((resolve) => {
      const id = setInterval(() => {
        const deps = ["SessionStore", "gZenWorkspaces", "gZenThemePicker"]
        
        let depsExist = true;
        for (const dep of deps) {
          if (!window.hasOwnProperty(dep)) {
            depsExist = false;
          }
        }

        if (depsExist) {
          clearInterval(id);
          resolve();
        }
      }, 50);
    });
  }

  // Set up observer for workspace changes to update group visibility
  setupWorkspaceObserver() {
    // Override the original workspace switching method to add our visibility update
    const originalSwitchToWorkspace = window.gZenWorkspaces.switchToWorkspace;
    window.gZenWorkspaces.switchToWorkspace = (...args) => {
      const result = originalSwitchToWorkspace.apply(window.gZenWorkspaces, args);
      // Update group visibility after workspace switch
      setTimeout(() => this.updateGroupVisibility(), 100);
      return result;
    };
  
    // Also listen for workspace strip changes
    const workspaceObserver = new MutationObserver(() => {
      setTimeout(() => this.updateGroupVisibility(), 100);
    });
  
    // Observe changes to the workspace container
    const workspaceContainer = document.querySelector("#zen-workspaces-button");
    if (workspaceContainer) {
      workspaceObserver.observe(workspaceContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['selected', 'active']
      });
    }
  }

  // Update visibility of tab groups based on active workspace.
  // Tracked with atg-ws-hidden (hiding scoped to real strips in CSS) instead
  // of the hidden attribute: the Library spaces section skips hidden nodes
  // when copying rows, so hidden groups would never render in space cards.
  // tabGroups already excludes section copies, but clear both attributes
  // there anyway (older ATG hid copies too).
  updateGroupVisibility() {
    try {
      // Get all tab groups in the active workspace using DOM query (for active workspace detection)
      const activeWorkspaceGroups = gZenWorkspaces?.activeWorkspaceStrip?.querySelectorAll("tab-group") || [];
      const activeGroupIds = new Set(Array.from(activeWorkspaceGroups).map(g => g.id));

      this.tabGroups.forEach(group => {
        // Skip split-view-groups and drag ghosts
        if (group.hasAttribute && (group.hasAttribute("split-view-group") || group.hasAttribute("drag-image"))) {
          return;
        }

        // Migration: older ATG revisions hid groups with `hidden`.
        group.removeAttribute("hidden");

        // Add or remove workspace-hiding based on workspace membership
        if (activeGroupIds.has(group.id)) {
          // Group is in active workspace - make sure it shows
          group.removeAttribute("atg-ws-hidden");
        } else {
          // Group is not in active workspace - hide in real strips (CSS)
          group.setAttribute("atg-ws-hidden", "true");
        }
      });
    } catch (error) {
      console.error("[AdvancedTabGroups] Error updating group visibility:", error);
    }
  }

  // Remove Firefox's built-in tab group editor menu elements if present
  removeBuiltinTabGroupMenu(root = document) {
    try {
      const list = root.querySelectorAll
        ? root.querySelectorAll("#tab-group-editor, tabgroup-meu")
        : [];
      list.forEach((el) => {
        el.remove();
      });
      // Fallback direct id lookup
      const byId = root.getElementById
        ? root.getElementById("tab-group-editor")
        : null;
      if (byId) {
        byId.remove();
      }
    } catch (e) {
      console.error(
        "[AdvancedTabGroups] Error removing built-in tab group menu:",
        e
      );
    }
  }

  // ---- Icon picker integration (issue #156) ----
  // Searchable icons + custom icons for tab groups.
  // Deliberately does NOT wrap window.gZenEmojiPicker.open: wrapping races
  // with the custom icon picker mod (zia-extended-icons, which wraps open()
  // itself) and breaks icon setting. Instead each ATG pick owns a small
  // completion closure fed by an onSelect capture on our own open() call —
  // which both native and zia implementations invoke synchronously at pick
  // time — immune to promise race ordering between wrappers.
  // When zia-extended-icons is installed its Tabler tab is reused (ours is
  // skipped); otherwise ATG's bundled Tabler tab (icons/ in this mod)
  // provides the same searchable set with no extra mod required.
  setupIconPickerIntegration() {
    if (this._iconPickerIntegrated) {
      return;
    }
    this._iconPickerIntegrated = true;
    const tryInstall = () => {
      try {
        const picker = window.gZenEmojiPicker;
        const panel = document.getElementById("PanelUI-zen-emojis-picker");
        if (!picker || !panel || typeof picker.open !== "function") {
          setTimeout(tryInstall, 400);
          return;
        }
        this.enhanceEmojiPickerPanel(panel);
      } catch (error) {
        console.error("[AdvancedTabGroups] Error setting up icon picker:", error);
      }
    };
    tryInstall();
  }

  // Per-pick flow. Never wraps or replaces picker.open: we call through
  // (native or zia-wrapped) and capture the value via onSelect, which both
  // implementations invoke synchronously at pick time — immune to promise
  // race ordering between wrappers.
  // Returns { value, explicit }: explicit picks (icon, Tabler, upload,
  // trash/none) vs dismissals (ESC/click-away, keep existing icon).
  openAtgIconPicker(anchor) {
    const picker = window.gZenEmojiPicker;
    const panel = document.getElementById("PanelUI-zen-emojis-picker");
    return new Promise(resolve => {
      let settled = false;
      let sawSelect = false;
      const finish = (value, explicit) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          panel?.removeEventListener("popuphidden", onHidden);
        } catch (_) {}
        if (this._activeIconPickDone === done) {
          this._activeIconPickDone = null;
          // Keep _activeIconPickGroup: the OS file dialog can settle this
          // session before the upload finishes; the fallback below still
          // needs the group. It is overwritten on the next pick.
        }
        this.setAtgPickerUiVisible(false);
        resolve({ value: value ?? null, explicit: Boolean(explicit) });
      };
      const done = (value, explicit) => finish(value, explicit);
      // Our own UI (bundled Tabler tab, header upload button) completes
      // through this; it hides the panel first so native/zia also settle
      // (their late settlements are ignored via `settled`).
      this._activeIconPickDone = done;
      try {
        this._activeIconPickGroup = anchor?.closest?.("tab-group") || null;
      } catch (_) {
        this._activeIconPickGroup = null;
      }
      this.setAtgPickerUiVisible(true);
      const onHidden = () => {
        // Dismissed without picking (or after our own pick already
        // settled): keep the existing icon.
        finish(null, sawSelect);
      };
      try {
        panel?.addEventListener("popuphidden", onHidden, { once: true });
      } catch (_) {}
      let nativeResult = null;
      try {
        nativeResult = picker.open(anchor, {
          onlySvgIcons: !Services.prefs.getBoolPref("browser.tabs.groups.allow-emojis", false),
          onSelect: value => {
            sawSelect = true;
            done(value, true);
          },
        });
      } catch (error) {
        console.error("[AdvancedTabGroups] Error opening icon picker:", error);
        nativeResult = null;
      }
      Promise.resolve(nativeResult).then(
        value => {
          // Resolved picks already settled via onSelect; dismissal here
          // (null without onSelect) means keep.
          finish(value, sawSelect);
        },
        () => {
          // Native rejects on dismiss-without-selection: keep icon.
          finish(null, false);
        }
      );
    });
  }

  // Called by ATG's own picker UI (Tabler tab, header upload button).
  completeActiveIconPick(value) {
    const done = this._activeIconPickDone;
    if (typeof done !== "function") {
      return false;
    }
    try {
      document.getElementById("PanelUI-zen-emojis-picker")?.hidePopup();
    } catch (_) {}
    done(value, true);
    return true;
  }

  // ATG's header upload only applies to group icon picks; hide it for
  // folder/space flows using the shared panel. While it is shown, also hide
  // Zen's native empty spacer button so no fake button sits between upload
  // and the Emojis tab (restored afterwards only if we hid it).
  setAtgPickerUiVisible(visible) {
    try {
      const upload = document.getElementById("atg-custom-icon-header-upload");
      if (upload) {
        upload.hidden = !visible;
      }
      const spacer = this._atgPickerSpacer;
      if (spacer && spacer.isConnected) {
        if (visible) {
          this._atgSpacerHiddenByUs = !spacer.hidden;
          spacer.hidden = true;
        } else if (this._atgSpacerHiddenByUs) {
          spacer.hidden = false;
          this._atgSpacerHiddenByUs = false;
        }
      }
    } catch (_) {}
  }

  // Inject ATG's picker UI: an upload button top-left of the picker header
  // (parallel to the trash/delete button top-right) and — when
  // zia-extended-icons is absent — a bundled searchable Tabler tab
  // (icons/ in this mod) so Tabler needs no extra mod.
  enhanceEmojiPickerPanel(panel) {
    if (panel.__atgPickerUiAdded) {
      return;
    }
    panel.__atgPickerUiAdded = true;
    try {
      this.addHeaderUploadButton(panel);
      // Bundled Tabler only when zia-extended-icons isn't providing its own.
      if (this.atgTablerAvailable()) {
        this.setupAtgTablerPack();
        this.addAtgTablerTab(panel);
      }
      // The Tabler tab lives in the shared tab strip, so gate it per open:
      // visible for ATG group picks, hidden for folder/space flows.
      panel.addEventListener("popupshowing", () => {
        try {
          const active = typeof this._activeIconPickDone === "function";
          for (const id of ["atg-tabler-tab", "atg-tabler-page"]) {
            const el = document.getElementById(id);
            if (el) {
              el.hidden = !active;
            }
          }
        } catch (_) {}
        this.syncUploadButtonGeometry();
      });
    } catch (error) {
      console.error("[AdvancedTabGroups] Error adding picker UI:", error);
    }
    this.addZenSvgSearchFallback(panel);
  }

  // Upload trigger pinned to the far left of the picker header, mirroring
  // the trash/delete button (#PanelUI-zen-emojis-picker-none) pinned to the
  // far right (the header uses space-between, so true first/last children
  // stay on the edges, never drifting center). Zen disables pointer events
  // on the header's first toolbarbutton, so the CSS re-enables them for ours.
  // Icon-only 22px toolbarbutton with Zen's share glyph. Only visible during
  // ATG group icon picks.
  addHeaderUploadButton(panel) {
    try {
      const header = document.getElementById("PanelUI-zen-picker-header");
      if (!header || document.getElementById("atg-custom-icon-header-upload")) {
        return;
      }
      // Zen's native empty spacer (id-less toolbarbutton, pointer-events:
      // none) would otherwise render as a fake button between upload and
      // the Emojis tab now that upload is first. Tracked so visibility
      // gating can hide it while our upload is shown.
      if (!this._atgPickerSpacer?.isConnected) {
        this._atgPickerSpacer =
          header.querySelector(":scope > toolbarbutton:not([id])") || null;
      }
      const upload = document.createXULElement("toolbarbutton");
      upload.id = "atg-custom-icon-header-upload";
      upload.className = "toolbarbutton-1";
      upload.setAttribute("tooltiptext", "Upload custom icon");
      upload.hidden = true;
      upload.addEventListener("command", async event => {
        event.stopPropagation();
        const dataUrl = await this.promptCustomIconFile();
        if (!dataUrl) {
          return;
        }
        // The OS file dialog can hide the panel, settling the pick session
        // first — then apply directly to the pending group instead.
        if (!this.completeActiveIconPick(dataUrl)) {
          this.applyPickedIconToGroup(dataUrl);
        }
      });
      if (header.firstElementChild) {
        header.insertBefore(upload, header.firstElementChild);
      } else {
        header.appendChild(upload);
      }
      this.syncUploadButtonGeometry();
    } catch (error) {
      console.error("[AdvancedTabGroups] Error adding header upload button:", error);
    }
  }

  // Copy the trash/delete button's computed box onto the upload button so
  // both match exactly on any Zen version, even if Zen's picker CSS drifts
  // from the values hardcoded in userChrome.css. Runs on every popupshowing
  // (stylesheet values compute even while hidden).
  syncUploadButtonGeometry() {
    try {
      const upload = document.getElementById("atg-custom-icon-header-upload");
      const trash = document.getElementById("PanelUI-zen-emojis-picker-none");
      if (!upload || !trash) {
        return;
      }
      const cs = window.getComputedStyle(trash);
      for (const prop of ["width", "height"]) {
        const value = parseFloat(cs.getPropertyValue(prop));
        if (Number.isFinite(value) && value > 0) {
          upload.style.setProperty(prop, `${value}px`, "important");
        }
      }
      const appearance = (cs.getPropertyValue("appearance") || "").trim();
      if (appearance) {
        upload.style.setProperty("appearance", appearance, "important");
      }
    } catch (_) {}
  }

  // Direct-apply fallback for uploads that outlive their pick session
  // (panel hidden by the OS file dialog before completion).
  applyPickedIconToGroup(iconUrl) {
    try {
      const group = this._activeIconPickGroup;
      if (!group || !group.isConnected) {
        return false;
      }
      if (typeof iconUrl === "string" && iconUrl.length > 220 * 1024) {
        console.warn("[AdvancedTabGroups] Icon too large, refusing to persist it.");
        return false;
      }
      this.persistGroupIcon(group, iconUrl);
      this._activeIconPickGroup = null;
      return true;
    } catch (error) {
      console.error("[AdvancedTabGroups] Error applying picked icon:", error);
      return false;
    }
  }

  // Shared render + persist tail for live picks, restores and fallbacks.
  // Save first (updateIconColor bakes from storage) and sync before
  // recoloring so the CSS icon color it reads is current.
  persistGroupIcon(group, iconUrl) {
    this.saveGroupIcon(group.id, iconUrl);
    this.renderGroupIconElement(group, iconUrl);
    this.syncGroupColorVars(group);
    this.updateIconColor(group, this.savedColors[group.id]?.gradientColors || []);
    // Push the new icon into spaces-section cards (no rebuild on picks).
    this.refreshSpacesSectionGroupIcon(group);
    document.querySelector("zen-library")?.update?.(true);
  }

  // Zen's picker search box may only filter emojis; ensure the SVG icon
  // grid filters by name as well. Scoped strictly to Zen's own list so it
  // never fights zia-extended-icons' Tabler grid.
  addZenSvgSearchFallback(panel) {
    try {
      const search = document.getElementById("PanelUI-zen-emojis-picker-search");
      if (!search || search.__atgSearchFallbackAdded) {
        return;
      }
      search.__atgSearchFallbackAdded = true;
      search.addEventListener("input", () => {
        try {
          const list = document.getElementById("PanelUI-zen-emojis-picker-svgs");
          if (!list) {
            return;
          }
          const terms = search.value.toLowerCase().split(/[\s,]+/).filter(Boolean);
          for (const item of list.querySelectorAll("toolbarbutton")) {
            if (!terms.length) {
              item.hidden = false;
              continue;
            }
            const haystack = [
              item.getAttribute("tooltiptext"),
              item.getAttribute("icon"),
              item.getAttribute("src"),
              item.getAttribute("label"),
            ].filter(Boolean).join(" ").toLowerCase();
            item.hidden = !terms.every(term => haystack.includes(term));
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  // ---- Bundled Tabler icons (no extra mod required) ----
  // Adapted from zia-extended-icons (MIT): searchable Tabler picker backed
  // by icons/tabler-*.js in this mod. Skipped whenever zia-extended-icons
  // is active so the two never duplicate tabs or resource packs.
  get atgTablerIconRoot() {
    return "chrome://sine/content/advanced-tab-groups/icons";
  }

  get atgTablerIconHost() {
    return "atg-tabler";
  }

  atgTablerPackPath() {
    const holder = {};
    Services.scriptloader.loadSubScript(`${this.atgTablerIconRoot}/tabler-pack.js`, holder);
    return PathUtils.join(PathUtils.profileDir, "atg-tabler-icons", `tabler-${holder.ZiaTablerPack}.zip`);
  }

  atgTablerPointAtPack(pack) {
    const handler = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    const jar = Services.io.newURI(`jar:${PathUtils.toFileURI(pack)}!/`);
    if (!handler.hasSubstitution(this.atgTablerIconHost) || handler.getSubstitution(this.atgTablerIconHost).spec !== jar.spec) {
      handler.setSubstitution(this.atgTablerIconHost, jar);
    }
  }

  // True for icons served by this mod's bundled Tabler pack. Those need
  // their resource:// host registered (setupAtgTablerPack) before any
  // group renders them; anything else (emoji, data: uploads, native and
  // zia URLs) needs no initialization.
  isAtgTablerIconUrl(iconUrl) {
    try {
      return typeof iconUrl === "string" && iconUrl.startsWith(`resource://${this.atgTablerIconHost}/`);
    } catch (_) {
      return false;
    }
  }

  // Resolves once handing `iconUrl` to a group is safe. Awaits the
  // bundled Tabler pack for atg-tabler URLs (kicking it off when needed);
  // a null generic pre-wait resolves once the owned pack (if any) is up.
  // Never rejects.
  ensureAtgCustomIconsReady(iconUrl = null) {
    try {
      if (iconUrl != null && !this.isAtgTablerIconUrl(iconUrl)) {
        return Promise.resolve();
      }
      if (iconUrl == null && !this.atgTablerAvailable()) {
        return Promise.resolve();
      }
      return Promise.resolve(this.setupAtgTablerPack());
    } catch (_) {
      return Promise.resolve();
    }
  }

  setupAtgTablerPack() {
    if (this._atgTablerPackReady || this.atgTablerUnavailable) {
      return this._atgTablerPackReady;
    }
    this._atgTablerPackReady = (async () => {
      this._atgTablerPackFailed = false;
      try {
        const pack = this.atgTablerPackPath();
        const dir = PathUtils.parent(pack);
        if (!(await IOUtils.exists(pack))) {
          const bytes = await this.atgTablerPackFromBundle();
          await IOUtils.makeDirectory(dir, { ignoreExisting: true });
          const part = `${pack}.${Math.random().toString(36).slice(2)}.part`;
          await IOUtils.write(part, bytes);
          await IOUtils.move(part, pack);
        }
        this.atgTablerPointAtPack(pack);
        for (const child of await IOUtils.getChildren(dir)) {
          if (child !== pack && /tabler-[^/\\]*\.zip(\.[a-z0-9]+\.part)?$/.test(child)) {
            IOUtils.remove(child).catch(() => {});
          }
        }
        this.atgTablerRedrawPackIcons();
      } catch (error) {
        console.error("[AdvancedTabGroups] Tabler pack setup failed:", error);
        this._atgTablerPackFailed = true;
        this.atgTablerUnavailable = true;
      }
    })();
    return this._atgTablerPackReady;
  }

  atgTablerCrc32(bytes) {
    let table = this._atgTablerCrcTable;
    if (!table) {
      table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
      }
      this._atgTablerCrcTable = table;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  async atgTablerPackFromBundle() {
    const holder = {};
    Services.scriptloader.loadSubScript(`${this.atgTablerIconRoot}/tabler-bundle.js`, holder);
    const { head, icons } = holder.ZiaTablerBundle;
    const entries = [];
    for (const style of Object.keys(icons).sort()) {
      for (const name of Object.keys(icons[style]).sort()) {
        entries.push([`${style}/${name}.svg`, `${head[style]}${icons[style][name]}</svg>`]);
      }
    }
    try {
      entries.push(["LICENSE", await (await fetch(`${this.atgTablerIconRoot}/tabler-LICENSE`)).text()]);
    } catch (_) {}
    const encoder = new TextEncoder();
    const items = entries.map(([name, text]) => {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(text);
      return { nameBytes, data, crc: this.atgTablerCrc32(data) };
    });
    let size = 22;
    for (const item of items) {
      size += 30 + 46 + 2 * item.nameBytes.length + item.data.length;
    }
    const out = new Uint8Array(size);
    const view = new DataView(out.buffer);
    let at = 0;
    const u16 = v => { view.setUint16(at, v, true); at += 2; };
    const u32 = v => { view.setUint32(at, v, true); at += 4; };
    const DATE = 0x21;
    for (const item of items) {
      item.offset = at;
      u32(0x04034b50); u16(10); u16(0); u16(0); u16(0); u16(DATE);
      u32(item.crc); u32(item.data.length); u32(item.data.length);
      u16(item.nameBytes.length); u16(0);
      out.set(item.nameBytes, at); at += item.nameBytes.length;
      out.set(item.data, at); at += item.data.length;
    }
    const directory = at;
    for (const item of items) {
      u32(0x02014b50); u16(20); u16(10); u16(0); u16(0); u16(0); u16(DATE);
      u32(item.crc); u32(item.data.length); u32(item.data.length);
      u16(item.nameBytes.length); u16(0); u16(0); u16(0); u16(0);
      u32(0o644 << 16); u32(item.offset);
      out.set(item.nameBytes, at); at += item.nameBytes.length;
    }
    const directorySize = at - directory;
    u32(0x06054b50); u16(0); u16(0); u16(items.length); u16(items.length);
    u32(directorySize); u32(directory); u16(0);
    return out;
  }

  atgTablerRedrawPackIcons() {
    try {
      const prefix = `resource://${this.atgTablerIconHost}/`;
      for (const image of document.querySelectorAll("image, img")) {
        for (const name of ["src", "href"]) {
          const url = image.getAttribute(name);
          if (url?.startsWith(prefix)) {
            image.setAttribute(name, "");
            image.setAttribute(name, url);
            if (image.style.opacity === "0") {
              image.style.opacity = "1";
            }
          }
        }
      }
    } catch (_) {}
  }

  atgTablerIcons() {
    if (!this._atgTablerIndex) {
      const holder = {};
      try {
        Services.scriptloader.loadSubScript(`${this.atgTablerIconRoot}/tabler-names.js`, holder);
      } catch (error) {
        console.error("[AdvancedTabGroups] Tabler names failed to load:", error);
        this.atgTablerUnavailable = true;
        return [];
      }
      this._atgTablerIndex = (holder.ZiaTablerIcons || []).map(row => {
        const [name, styles, words] = row.split("|");
        return { name, outline: styles.includes("o"), filled: styles.includes("f"), words: words || "" };
      });
    }
    return this._atgTablerIndex;
  }

  atgTablerStyle() {
    try {
      return Services.prefs.getStringPref("sine.extendedIcons.style", "outline") === "filled" ? "filled" : "outline";
    } catch (_) {
      return "outline";
    }
  }

  atgTablerSearch(icons, text) {
    const terms = text.toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (!terms.length) {
      return icons;
    }
    const scored = [];
    for (const icon of icons) {
      const parts = icon.name.split("-");
      let score = 0;
      for (const term of terms) {
        if (parts.includes(term)) {
          score += 3;
        } else if (parts.some(part => part.startsWith(term))) {
          score += 2;
        } else if (icon.name.includes(term) || icon.words.includes(term)) {
          score += 1;
        } else {
          score = 0;
          break;
        }
      }
      if (score) {
        if (icon.name === terms.join("-")) {
          score += 10;
        } else if (parts[0] === terms[0]) {
          score += 1;
        }
        scored.push({ icon, score });
      }
    }
    return scored.sort((a, b) => b.score - a.score || a.icon.name.length - b.icon.name.length).map(entry => entry.icon);
  }

  atgTablerAvailable() {
    return !window.__sineExtendedIconsLoaded && !document.getElementById("sine-extended-icons-tab");
  }

  addAtgTablerTab(panel) {
    try {
      if (!this.atgTablerAvailable() || document.getElementById("atg-tabler-tab")) {
        return;
      }
      const tabs = document.getElementById("PanelUI-zen-emojis-buttons-wrapper");
      const pages = document.getElementById("PanelUI-zen-emojis-picker-pages");
      if (!tabs || !pages) {
        return;
      }
      const tab = document.createXULElement("toolbarbutton");
      tab.id = "atg-tabler-tab";
      tab.setAttribute("label", "Tabler");
      tabs.appendChild(tab);

      const zenTab = document.getElementById("PanelUI-zen-emojis-picker-change-svg");
      if (zenTab && zenTab.getAttribute("label") !== "Zen") {
        zenTab.removeAttribute("data-l10n-id");
        zenTab.removeAttribute("data-l10n-args");
        zenTab.setAttribute("label", "Zen");
      }

      const HTML = "http://www.w3.org/1999/xhtml";
      const page = document.createXULElement("vbox");
      page.id = "atg-tabler-page";
      const bar = document.createElementNS(HTML, "div");
      bar.id = "atg-tabler-searchbar";
      const box = document.createElementNS(HTML, "input");
      box.id = "atg-tabler-search";
      box.setAttribute("type", "text");
      box.setAttribute("placeholder", "Search icons");
      const styles = document.createElementNS(HTML, "div");
      styles.id = "atg-tabler-style";
      const styleButtons = {};
      for (const [value, label] of [["outline", "Outline"], ["filled", "Solid"]]) {
        const button = document.createElementNS(HTML, "button");
        button.className = "atg-tabler-style-option";
        button.textContent = label;
        button.addEventListener("click", event => {
          event.stopPropagation();
          try {
            Services.prefs.setStringPref("sine.extendedIcons.style", value);
          } catch (_) {}
          showStyle();
          render();
        });
        styleButtons[value] = button;
        styles.appendChild(button);
      }
      bar.append(box, styles);
      const grid = document.createElementNS(HTML, "div");
      grid.id = "atg-tabler-grid";
      const empty = document.createElementNS(HTML, "div");
      empty.id = "atg-tabler-empty";
      empty.textContent = "No icons found";
      empty.hidden = true;
      page.append(bar, grid, empty);
      pages.appendChild(page);

      const showStyle = () => {
        const current = this.atgTablerStyle();
        for (const [value, button] of Object.entries(styleButtons)) {
          button.toggleAttribute("selected", value === current);
        }
      };

      let showing = false;
      const BATCH = 180;
      let results = [];
      let shown = 0;
      let lastQuery = null;
      const more = document.createElementNS(HTML, "div");
      more.id = "atg-tabler-more";
      const moreWatcher = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          addMore();
        }
      }, { root: grid, rootMargin: "200px" });
      moreWatcher.observe(more);

      const choose = url => {
        try {
          panel.removeAttribute("hide-none-option");
        } catch (_) {}
        this.completeActiveIconPick(url);
      };

      const addMore = () => {
        if (shown >= results.length) {
          return;
        }
        const style = this.atgTablerStyle();
        const fragment = document.createDocumentFragment();
        for (const icon of results.slice(shown, shown + BATCH)) {
          const url = `resource://${this.atgTablerIconHost}/${style}/${icon.name}.svg`;
          const item = document.createXULElement("toolbarbutton");
          item.className = "toolbarbutton-1 zen-emojis-picker-svg atg-tabler-item";
          item.setAttribute("tooltiptext", icon.name.replace(/-/g, " "));
          item.style.listStyleImage = `url(${url})`;
          item.addEventListener("command", event => {
            event.stopPropagation();
            choose(url);
          });
          fragment.appendChild(item);
        }
        shown = Math.min(results.length, shown + BATCH);
        grid.insertBefore(fragment, more);
      };

      const render = () => {
        const style = this.atgTablerStyle();
        const query = `${style}:${(box.value || "").trim()}`;
        if (query === lastQuery) {
          return;
        }
        lastQuery = query;
        results = this.atgTablerSearch(this.atgTablerIcons().filter(icon => icon[style]), box.value || "");
        shown = 0;
        grid.replaceChildren(more);
        grid.scrollTop = 0;
        empty.hidden = results.length > 0;
        addMore();
      };

      const show = () => {
        showing = true;
        showStyle();
        render();
        box.focus({ preventScroll: true });
        page.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
        tab.classList.add("selected");
        for (const other of tabs.children) {
          if (other !== tab) {
            other.classList.remove("selected");
          }
        }
      };

      tab.addEventListener("command", show);
      panel.addEventListener("command", event => {
        if (event.target === tab) {
          return;
        }
        if (event.target.id?.startsWith("PanelUI-zen-emojis-picker-change")) {
          showing = false;
          tab.classList.remove("selected");
        }
      });
      box.addEventListener("input", render);
      const zenSearch = document.getElementById("PanelUI-zen-emojis-picker-search");
      zenSearch?.addEventListener("input", () => {
        if (showing) {
          box.value = zenSearch.value;
          render();
        }
      });
      panel.addEventListener("popupshown", () => {
        showing = false;
        tab.classList.remove("selected");
        if (lastQuery !== null) {
          render();
        }
      });

      // If zia-extended-icons loads after us, its Tabler tab wins and ours
      // is removed to avoid duplicates.
      setTimeout(() => {
        try {
          if (!this.atgTablerAvailable() && tab.isConnected) {
            tab.remove();
            page.remove();
          }
        } catch (_) {}
      }, 3000);
    } catch (error) {
      console.error("[AdvancedTabGroups] Error adding Tabler tab:", error);
    }
  }

  // True for values renderable as <image>: data: URLs, remote images, and
  // internal icon URLs (chrome://, resource:// Tabler pack, moz-icon:).
  // Anything else (emoji, single glyph) renders as a <label>.
  isGroupIconImageUrl(iconUrl) {
    if (typeof iconUrl !== "string") {
      return false;
    }
    const url = iconUrl.trim();
    if (!url || /^(javascript|data:text\/html)/i.test(url)) {
      return false;
    }
    if (/^(data:image\/|blob:|moz-icon:|chrome:\/\/|resource:\/\/|file:\/\/)/i.test(url)) {
      return true;
    }
    if (/^https?:\/\//i.test(url)) {
      return /[\w\-%.~:/?#[\]@!$&'()*+,;=]+/i.test(url) &&
        (/\.(svg|png|jpe?g|webp|gif|avif|ico|bmp)(\?[^\s]*)?(#[^\s]*)?$/i.test(url) ||
          /^https?:\/\/[^\s]+$/i.test(url));
    }
    if (/\.svg(\?[^\s]*)?(#[^\s]*)?$/i.test(url)) {
      return true;
    }
    // Bare Tabler/resource paths without scheme (defensive).
    if (url.includes("/") && !/\s/.test(url) && /\.(svg|png|jpe?g|webp|gif|avif)$/i.test(url)) {
      return true;
    }
    return false;
  }

  // Raster uploads render as-is; only recolor monochrome SVGs.
  isRasterGroupIcon(src) {
    if (typeof src !== "string") {
      return false;
    }
    if (/^data:image\/(?!svg)/i.test(src)) {
      return true;
    }
    return /\.(png|jpe?g|webp|gif|avif|bmp|ico)(\?[^\s]*)?(#[^\s]*)?$/i.test(src) &&
      !/\.svg/i.test(src);
  }

  // Let the user pick a local image file and return a downscaled data: URL
  // (max 96px, PNG to keep transparency). Caps size so SessionStore stays
  // small; returns null on cancel/oversize/error.
  promptCustomIconFile() {
    return new Promise(resolve => {
      try {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/svg+xml,image/png,image/jpeg,image/webp,image/gif,image/avif,image/x-icon,image/bmp";
        input.style.display = "none";
        document.documentElement.appendChild(input);
        input.addEventListener("cancel", () => {
          input.remove();
          resolve(null);
        });
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          input.remove();
          if (!file) {
            resolve(null);
            return;
          }
          const MAX_BYTES = 200 * 1024;
          if (file.size > 4 * 1024 * 1024) {
            console.warn("[AdvancedTabGroups] Custom icon too large (>4MB), skipping:", file.name);
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onerror = () => resolve(null);
          reader.onload = () => {
            const dataUrl = String(reader.result || "");
            if (dataUrl.startsWith("data:image/svg")) {
              // Normalize solid fills/strokes to context paint so uploaded
              // SVGs follow the same contrast fill rules as built-in icons.
              const normalized = this.normalizeUploadedSvg(dataUrl);
              const out = normalized || dataUrl;
              if (out.length > MAX_BYTES) {
                console.warn("[AdvancedTabGroups] Custom SVG too large, skipping:", file.name);
                resolve(null);
                return;
              }
              resolve(out);
              return;
            }
            // Downscale raster images so persisted icons stay small.
            const img = new Image();
            img.onload = () => {
              try {
                const MAX_DIM = 96;
                const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
                const width = Math.max(1, Math.round((img.naturalWidth || MAX_DIM) * scale));
                const height = Math.max(1, Math.round((img.naturalHeight || MAX_DIM) * scale));
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                const out = canvas.toDataURL("image/png");
                if (out.length > MAX_BYTES) {
                  console.warn("[AdvancedTabGroups] Custom icon still too large after resize, skipping:", file.name);
                  resolve(null);
                  return;
                }
                resolve(out);
              } catch (error) {
                console.error("[AdvancedTabGroups] Error resizing custom icon:", error);
                resolve(dataUrl.length <= MAX_BYTES ? dataUrl : null);
              }
            };
            img.onerror = () => {
              resolve(dataUrl.length <= MAX_BYTES ? dataUrl : null);
            };
            img.src = dataUrl;
          };
          reader.readAsDataURL(file);
        }, { once: true });
        input.click();
      } catch (error) {
        console.error("[AdvancedTabGroups] Error opening custom icon picker:", error);
        resolve(null);
      }
    });
  }

  // Rewrite an uploaded SVG data: URL so solid fills/strokes use context
  // paint (context-fill/context-stroke), exactly like Zen's own monochrome
  // icons. Parsed with DOMParser (not regex) so every attribute spelling,
  // inline style and embedded <style> block is covered. Gradient (url()),
  // none and inherit paints are preserved. Returns the normalized data: URL,
  // or null when decoding or validation fails (caller falls back to the
  // original).
  normalizeUploadedSvg(dataUrl) {
    try {
      const comma = dataUrl.indexOf(",");
      if (comma < 0) {
        return null;
      }
      const header = dataUrl.slice(0, comma);
      const body = dataUrl.slice(comma + 1);
      let text;
      if (/;base64/i.test(header)) {
        const bin = atob(body.replace(/\s+/g, ""));
        text = new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(bin, c => c.charCodeAt(0))
        );
      } else {
        text = decodeURIComponent(body);
      }
      if (!/<svg[\s>]/i.test(text)) {
        return null;
      }
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      if (!doc || doc.querySelector("parsererror") || !doc.documentElement ||
          doc.documentElement.localName !== "svg") {
        return null;
      }
      const isSolidPaint = value => /^(?!none\b|inherit\b|url\()/i.test(String(value).trim());
      const normalizeDecls = (css, toFill, toStroke) => {
        css = css.replace(/(fill\s*:\s*)([^;}!]+)/gi, (m, prop, value) =>
          isSolidPaint(value) ? `${prop}${toFill}` : m);
        css = css.replace(/(stroke\s*:\s*)([^;}!]+)/gi, (m, prop, value) =>
          isSolidPaint(value) ? `${prop}${toStroke}` : m);
        return css;
      };
      for (const el of doc.querySelectorAll("*")) {
        for (const [attr, ctx] of [["fill", "context-fill"], ["stroke", "context-stroke"]]) {
          if (el.hasAttribute(attr) && isSolidPaint(el.getAttribute(attr))) {
            el.setAttribute(attr, ctx);
          }
        }
        const inline = el.getAttribute("style");
        if (inline && /(fill|stroke)\s*:/i.test(inline)) {
          const next = normalizeDecls(inline, "context-fill", "context-stroke");
          if (next !== inline) {
            el.setAttribute("style", next);
          }
        }
        if (el.localName === "style") {
          const css = el.textContent || "";
          const next = normalizeDecls(css, "context-fill", "context-stroke");
          if (next !== css) {
            el.textContent = next;
          }
        }
      }
      // Default root fill so fill-less paths theme too (inherited).
      if (!doc.documentElement.hasAttribute("fill")) {
        doc.documentElement.setAttribute("fill", "context-fill");
      }
      text = new XMLSerializer().serializeToString(doc);
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
    } catch (error) {
      console.error("[AdvancedTabGroups] Error normalizing uploaded SVG:", error);
      return null;
    }
  }

  // Shared DOM renderer: image URLs become <image class="group-icon">,
  // emoji/text becomes a <label>. Used by both live picks and restores so
  // custom icons render identically everywhere (sidebar + library).
  renderGroupIconElement(group, iconUrl) {
    const iconContainer = group.querySelector(".tab-group-icon-container");
    let iconElement = group.querySelector(".tab-group-icon");
    if (!iconContainer || !iconElement) {
      return null;
    }
    iconElement.querySelector("image")?.remove();
    iconElement.querySelector("label")?.remove();
    if (!iconUrl) {
      iconElement.removeAttribute("zen-emoji-open");
      return iconElement;
    }
    let node = null;
    let isImage = false;
    try {
      if (this.isGroupIconImageUrl(iconUrl)) {
        isImage = true;
        node = window.MozXULElement.parseXULToFragment(
          `<image src="${iconUrl.replace(/"/g, "&quot;")}" class="group-icon" alt="Group Icon"/>`
        ).firstElementChild;
      } else {
        const fragment = window.MozXULElement.parseXULToFragment("<label/>");
        node = fragment.firstElementChild;
        node.textContent = iconUrl;
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error creating group icon node:", error);
      return null;
    }
    if (node) {
      iconElement.appendChild(node);
      // Mirror native picker state so sidebar/library selectors that key
      // off zen-emoji-open keep working for emoji labels.
      if (isImage) {
        iconElement.removeAttribute("zen-emoji-open");
      } else {
        iconElement.setAttribute("zen-emoji-open", "true");
      }
    }
    return iconElement;
  }

  // Context paint marker used for normalized uploads (either fill or
  // stroke form; stroke-only SVGs carry no context-fill).
  hasContextPaint(storedUrl) {
    return typeof storedUrl === "string" && /context-(fill|stroke)(?!-opacity)/i.test(storedUrl);
  }

  // Render copy of a normalized upload with the contrast color baked in.
  // Baking (instead of relying on context-fill resolving through <image>)
  // makes uploads render identically on every build: plain recolored SVG,
  // no dependence on -moz-context-properties, inline styles or Zen version.
  // Storage always keeps the context original so later recolors rebake.
  // Opacity variants (context-fill-opacity) are left intact.
  bakeGroupIconSvg(storedUrl, contrast) {
    if (typeof storedUrl !== "string" || !/^data:image\/svg/i.test(storedUrl)) {
      return null;
    }
    return storedUrl
      .replace(/context-fill(?!-opacity)/g, contrast)
      .replace(/context-stroke(?!-opacity)/g, contrast);
  }

  // The exact icon color CSS paints with: .tab-group-icon-container sets
  // `color: var(--tab-group-stroke)`, so its computed color is the resolved
  // stroke (var()/light-dark()/color-mix() all resolved, gradients excluded).
  // Returns "" when it cannot be determined.
  cssIconColor(group) {
    try {
      const container = group?.querySelector?.(".tab-group-icon-container");
      if (container) {
        const color = getComputedStyle(container).color;
        if (color && !/gradient/i.test(color)) {
          return color;
        }
      }
    } catch (_) {}
    try {
      const stroke = String(this.getGroupStrokeValue(group) || "").trim();
      if (stroke && !/gradient/i.test(stroke)) {
        return stroke;
      }
    } catch (_) {}
    return "";
  }

  // Contrast fallback when no gradient data is available: black icons on
  // light group colors, white icons otherwise (matches the .group-icon
  // stylesheet default of white).
  groupNeedsBlackIcon(group) {
    try {
      const match = String(this.getGroupColorValue(group) || "")
        .match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (match) {
        const luminance = (0.2126 * +match[1] + 0.7152 * +match[2] + 0.0722 * +match[3]) / 255;
        return luminance >= 0.5;
      }
    } catch (_) {}
    return false;
  }

  // Clear the visible icon and drop persisted state (context menu action).
  removeGroupIcon(group) {
    try {
      if (!group) {
        return;
      }
      group.querySelector(".tab-group-icon image")?.remove();
      group.querySelector(".tab-group-icon label")?.remove();
      group.querySelector(".tab-group-icon")?.removeAttribute("zen-emoji-open");
      this.removeSavedIcon(group.id);
      this.syncGroupColorVars(group);
      document.querySelector("zen-library")?.update?.(true);
    } catch (error) {
      console.error("[AdvancedTabGroups] Error removing group icon:", error);
    }
  }

  // Library spaces-section cards hold live tab-group CLONES of the real
  // groups (upstream shallow-clones them, then fills their rows). They share
  // the tag name and live in the main document, so every tracker must
  // ignore them: processing/hiding/coloring copies breaks both the cards
  // and the real groups' saved state.
  isLibraryGroupCopy(node) {
    try {
      if (!node || node.localName !== "tab-group") {
        return false;
      }
      if (typeof node.id === "string" && node.id.endsWith("-copy")) {
        return true;
      }
      return !!node.closest?.("zen-library-spaces-section, zen-library");
    } catch (_) {
      return false;
    }
  }

  get tabGroups() {
    const groups = [
      ...(Array.isArray(gBrowser.tabGroups) ? gBrowser.tabGroups : []),
      ...document.querySelectorAll("tab-group"),
    ];
    return Array.from(new Set(groups)).filter(group =>
      (group.localName === "tab-group" || group.tagName === "tab-group") &&
      !this.isLibraryGroupCopy(group)
    );
  }

  getGroupById(groupId) {
    return this.tabGroups.find(group => group.id === groupId);
  }

  processExistingGroups() {
    this.tabGroups.forEach((group) => {
      // Skip split-view-groups
      if (!group.hasAttribute || !group.hasAttribute("split-view-group")) {
        this.processGroup(group);
      }
    });
  }

  // Track currently edited group for rename
  _editingGroup = null;
  _groupEdited = null;

  renameGroupKeydown(event) {
    event.stopPropagation();
    if (event.key === "Enter") {
      let label = this._groupEdited;
      let input = document.getElementById("tab-label-input");
      let newName = input.value.trim();
      document.documentElement.removeAttribute("zen-renaming-group");
      input.remove();
      if (label && newName) {
        const group = label.closest("tab-group");
        if (group && newName !== group.label) {
          group.label = newName;
        }
      }
      label.classList.remove("tab-group-label-editing");
      label.style.display = "";
      this._groupEdited = null;
    } else if (event.key === "Escape") {
      event.target.blur();
    }
  }

  renameGroupStart(group, selectAll = true) {
    // Force clear any existing rename state
    if (this._groupEdited) {
      const existingInput = document.getElementById("tab-label-input");
      if (existingInput) {
        existingInput.remove();
      }
      if (this._groupEdited) {
        this._groupEdited.classList.remove("tab-group-label-editing");
        this._groupEdited.style.display = "";
      }
      document.documentElement.removeAttribute("zen-renaming-group");
      this._groupEdited = null;
    }
    
    const labelElement = group.querySelector(".tab-group-label");
    if (!labelElement) return;
    this._groupEdited = labelElement;
    document.documentElement.setAttribute("zen-renaming-group", "true");
    labelElement.classList.add("tab-group-label-editing");
    labelElement.style.display = "none";
    const input = document.createElement("input");
    input.id = "tab-label-input";
    input.className = "tab-group-label";
    input.type = "text";
    input.value = group.label || labelElement.textContent || "";
    input.setAttribute("autocomplete", "off");
    input.style.caretColor = "auto";
    labelElement.after(input);
    // Focus after insertion
    input.focus();
    if (selectAll && input.value !== "\u200b") {
      // Select all text for manual rename
      input.select();
    } else {
      // Place cursor at end for auto-rename on new groups
      try {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      } catch (_) {}
    }
    input.addEventListener("keydown", this.renameGroupKeydown.bind(this));
    input.addEventListener("blur", this.renameGroupHalt.bind(this));
  }

  renameGroupHalt(event) {
    if (!this._groupEdited) {
      return;
    }
    if (document.activeElement === event.target) {
      return;
    }
    document.documentElement.removeAttribute("zen-renaming-group");
    let input = document.getElementById("tab-label-input");
    if (input) input.remove();
    this._groupEdited.classList.remove("tab-group-label-editing");
    this._groupEdited.style.display = "";
    this._groupEdited = null;
  }

  processGroup(group) {
    // Library spaces-section copies initialize as live elements but must
    // stay native: the section owns their rendering and interaction, and
    // ATG's buttons/menus/colors would leak into saved state under copy ids.
    if (this.isLibraryGroupCopy(group)) {
      return;
    }
    // Skip if already processed, if it's a folder, or if it's a split-view-group
    if (
      group.hasAttribute("data-close-button-added") ||
      group.classList.contains("zen-folder") ||
      group.hasAttribute("zen-folder") ||
      group.hasAttribute("split-view-group")
    ) {
      return;
    }

    const labelContainer = group.querySelector(".tab-group-label-container");
    if (!labelContainer) {
      return;
    }
    labelContainer.classList.add("zen-drop-target");
    this.ensureGroupContainer(group);

    // Check if close button already exists
    if (labelContainer.querySelector(".tab-close-button")) {
      return;
    }

    const tabContainer = group.querySelector(".tab-group-container");
    const grain = document.createElement("div");
    grain.className = "grain";
    tabContainer.appendChild(grain);

    // Create and inject the icon container and buttons
    const groupDomFrag = window.MozXULElement.parseXULToFragment(`
      <div class="tab-group-icon-container">
        <div class="tab-group-icon">
          <div class="grain"></div>
        </div>
        <image class="group-marker" role="button" keyNav="false" tooltiptext="Toggle Group"/>
      </div>
      <image class="tab-group-folder-button close-icon" role="button" keyNav="false" tooltiptext="Convert to Folder"/>
      <image class="tab-close-button close-icon" role="button" keyNav="false" tooltiptext="Close Group"/>
    `);
    const iconContainer = groupDomFrag.children[0];
    const folderButton = groupDomFrag.children[1];
    const closeButton = groupDomFrag.children[2];

    // Insert the icon container at the beginning of the label container
    labelContainer.insertBefore(iconContainer, labelContainer.firstChild);
    // Add the folder and close buttons to the label container
    labelContainer.appendChild(folderButton);
    labelContainer.appendChild(closeButton);

    folderButton.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      try { this.convertGroupToFolder(group); } catch (e) { console.error("[AdvancedTabGroups] Error converting to folder:", e); }
    });

    // Add click event listener
    closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      this.deleteGroup(group);
    });

    // Remove editor mode class if present (prevent editor mode on new group)
    group.classList.remove("tab-group-editor-mode-create");

    // Add context menu to the group first (this adds _useFaviconColor method)
    this.addContextMenu(group);

    // If the group is new (no label or default label), start renaming and set color
    if (
      !group.label ||
      group.label === "" ||
      ("defaultGroupName" in group && group.label === group.defaultGroupName)
    ) {
      // Start renaming
      this.renameGroupStart(group, false); // Don't select all for new groups
      // Set color to favicon mode (default for new groups)
      group.color = `${group.id}-favicon`;
      // Set color to average favicon color (default for new groups)
      if (typeof group._useFaviconColor === "function") {
        group._useFaviconColor();
      }
    } else {
      // For existing groups, also apply favicon color if no color is set
      const currentColor = document.documentElement.style.getPropertyValue(`--tab-group-color-${group.id}`);
      const savedColor = this.savedColors[group.id];
      // A native colour code (session-restored, or set by another mod) counts as set
      if (!currentColor && !savedColor && !this.hasNativeColor(group) && typeof group._useFaviconColor === "function") {
        group.color = `${group.id}-favicon`;
        group._useFaviconColor();
      }
    }

    // Set up observer to automatically update color when tabs change
    this.setupGroupColorObserver(group);

    // Set up observer to track collapsed state changes
    this.setupGroupCollapsedObserver(group);

    this.syncGroupColorVars(group);

    // Update group visibility based on workspace
    setTimeout(() => this.updateGroupVisibility(), 50);
  }

  // Set up observer to automatically update group color when tabs change
  setupGroupColorObserver(group) {
    if (group._colorObserverAdded) return;
    group._colorObserverAdded = true;

    // Debounce the color update to avoid too many updates
    let updateTimeout = null;
    
    const observer = new MutationObserver((mutations) => {
      // Check if tabs were actually added or removed
      const hasChanges = mutations.some(mutation => {
        const addedNodes = Array.from(mutation.addedNodes);
        const removedNodes = Array.from(mutation.removedNodes);
        return addedNodes.length > 0 || removedNodes.length > 0;
      });
      
      if (!hasChanges) return;
      
      // Debounce: wait 500ms after the last change before updating
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      
      updateTimeout = setTimeout(() => {
        // Update color when tabs are added or removed
        if (typeof group._useFaviconColor === "function" && group.color.endsWith("favicon")) {
          group._useFaviconColor();
        }
      }, 500);
    });

    observer.observe(group, {
      childList: true,
      subtree: true
    });
  }

  isArcMode() {
    try {
      return Services.prefs.getBoolPref("browser.tabs.groups.arc-style", false) ||
        Services.prefs.getBoolPref("tab.groups.fill-folders", false) ||
        Services.prefs.getBoolPref("tab.groups.theme-folders", false);
    } catch { return false; }
  }

  // Set up observer to track collapsed state changes
  setupGroupCollapsedObserver(group) {
    if (group._collapsedObserverAdded) return;
    group._collapsedObserverAdded = true;

    if (this.isArcMode() && group.hasAttribute("collapsed")) {
      try { group.removeAttribute("collapsed"); } catch {}
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes" && mutation.attributeName === "collapsed") {
          if (this.isArcMode() && group.hasAttribute("collapsed")) {
            try { group.removeAttribute("collapsed"); } catch {}
            return;
          }
          this.saveGroupCollapsedState(group.id, group.hasAttribute("collapsed"));
        }
      });
    });

    observer.observe(group, {
      attributes: true,
      attributeFilter: ["collapsed"]
    });
  }

  // Ensure a single, shared context menu exists and is wired up
  ensureSharedContextMenu() {
    if (this._sharedContextMenu) return this._sharedContextMenu;

    try {
      const contextMenuFrag = window.MozXULElement.parseXULToFragment(`
        <menupopup id="advanced-tab-groups-context-menu">
          <menu class="change-group-color" label="Change Color">
            <menupopup>
              <menuitem class="set-group-color" 
                        label="Edit Color"/>
              <menuitem class="use-favicon-color" 
                        label="Use Tab Icon Colors"/>
            </menupopup>
          </menu>
          <menuitem class="rename-group" label="Rename"/>
          <menuitem class="change-group-icon" label="Change Icon"/>
          <menuitem class="remove-group-icon" label="Remove Icon"/>
          <menuseparator/>
          <menu class="move-group-to-space" label="Move to Space">
            <menupopup class="move-group-to-space-popup"/>
          </menu>
          <menuseparator/>
          <menuitem class="ungroup-tabs" label="Ungroup"/>
          <menuitem class="convert-group-to-folder" 
                    label="Convert to Folder"/>
          <menuseparator/>
          <menuitem class="delete-group" label="Delete Group"/>
        </menupopup>
      `);

      const contextMenu = contextMenuFrag.firstElementChild;
      document.body.appendChild(contextMenu);

      // Track which group is targeted while the popup is open
      this._contextMenuCurrentGroup = null;

      const setGroupColorItem = contextMenu.querySelector(".set-group-color");
      const useFaviconColorItem = contextMenu.querySelector(".use-favicon-color");
      const renameGroupItem = contextMenu.querySelector(".rename-group");
      const changeGroupIconItem = contextMenu.querySelector(".change-group-icon");
      const removeGroupIconItem = contextMenu.querySelector(".remove-group-icon");
      const moveGroupToSpaceItem = contextMenu.querySelector(
        ".move-group-to-space"
      );
      const moveGroupToSpacePopup = contextMenu.querySelector(
        ".move-group-to-space-popup"
      );
      const ungroupTabsItem = contextMenu.querySelector(".ungroup-tabs");
      const convertToFolderItem = contextMenu.querySelector(
        ".convert-group-to-folder"
      );
      const deleteGroupItem = contextMenu.querySelector(".delete-group");

      const menuItems = [
        [setGroupColorItem, "_setGroupColor"],
        [useFaviconColorItem, "_useFaviconColor"],
        [renameGroupItem, this.renameGroupStart],
        [changeGroupIconItem, this.applyGroupIcon],
        [removeGroupIconItem, this.removeGroupIcon],
        [ungroupTabsItem, this.ungroupTabs],
        [convertToFolderItem, this.convertGroupToFolder],
        [deleteGroupItem, this.deleteGroup]
      ];

      for (const menuItem of menuItems) {
        if (menuItem[0]) {
          const handler = menuItem[1];
          const isGroupMethod = typeof handler === "string";
          menuItem[0].addEventListener("command", (event) => {
            const group = this._contextMenuCurrentGroup || contextMenu._lastGroup;
            console.log("[AdvancedTabGroups] command fired", menuItem[0].className, "group:", group?.id, "handler:", handler?.name || handler);
            if (!group) {
              console.warn("[AdvancedTabGroups] No target group for command", menuItem[0].className);
              return;
            }
            try {
              if (!isGroupMethod) {
                handler.call(this, group);
              } else {
                const fn = group[handler];
                if (typeof fn === "function") fn.call(group);
                else console.warn("[AdvancedTabGroups] group missing method", handler);
              }
            } catch(e){ console.error("[AdvancedTabGroups] command error", e); }
          });
        }
      }

      moveGroupToSpacePopup?.addEventListener("popupshowing", () => {
        this.populateMoveGroupToSpaceMenu(moveGroupToSpacePopup);
      });
      contextMenu.addEventListener("popupshowing", () => {
        contextMenu._lastGroup = this._contextMenuCurrentGroup;
        const workspaces = this.getWorkspaces();
        const currentWorkspaceId = this.getGroupWorkspaceId(
          this._contextMenuCurrentGroup
        );
        moveGroupToSpaceItem.hidden = workspaces.length <= 1;
        moveGroupToSpaceItem.disabled =
          !currentWorkspaceId ||
          workspaces.every(workspace => workspace.uuid === currentWorkspaceId);
      });

      contextMenu.addEventListener("popuphidden", () => {
        console.log("[AdvancedTabGroups] Context menu hidden", "lastGroup:", contextMenu._lastGroup?.id);
        setTimeout(()=>{ this._contextMenuCurrentGroup = null; }, 500);
      });

      this._sharedContextMenu = contextMenu;
      console.log("[AdvancedTabGroups] Shared context menu created successfully");
      return this._sharedContextMenu;
    } catch (error) {
      console.error("[AdvancedTabGroups] Error creating shared context menu:", error);
      return null;
    }
  }

  ensureGroupContainer(group) {
    let container = group?.querySelector?.(":scope > .tab-group-container");
    if (!container && group) {
      container = document.createElement("div");
      container.className = "tab-group-container";
      group.appendChild(container);
    }
    if (container && !container.querySelector(":scope > .zen-tab-group-start")) {
      const start = document.createElement("div");
      start.className = "zen-tab-group-start";
      container.prepend(start);
    }
    return container;
  }

  getRootTabContainer(group) {
    return (
      group?.closest?.(".zen-workspace-normal-tabs-section") ||
      window.gZenWorkspaces?.activeWorkspaceStrip ||
      gBrowser.tabContainer.querySelector(".zen-workspace-normal-tabs-section") ||
      gBrowser.tabContainer
    );
  }

  getDomParentGroup(group) {
    const parentContainer = group?.parentElement?.closest?.("tab-group");
    return parentContainer && parentContainer !== group ? parentContainer : null;
  }

  getSavedParentId(group) {
    if (!group?.id) {
      return null;
    }
    return (
      group.getAttribute("data-atg-parent-id") ||
      this.savedParents[group.id] ||
      null
    );
  }

  wouldCreateParentCycle(child, parent) {
    if (!child || !parent || child === parent || child.contains(parent)) {
      return true;
    }

    let current = parent;
    const seen = new Set();
    while (current && !seen.has(current.id)) {
      if (current === child || current.id === child.id) {
        return true;
      }
      seen.add(current.id);
      current = this.getGroupById(this.getSavedParentId(current));
    }
    return false;
  }

  nestGroupUnder(group, parentGroup, { save = true } = {}) {
    try {
      if (
        !group ||
        !parentGroup ||
        group.hasAttribute("split-view-group") ||
        parentGroup.hasAttribute("split-view-group") ||
        this.wouldCreateParentCycle(group, parentGroup)
      ) {
        return false;
      }

      const parentContainer = this.ensureGroupContainer(parentGroup);
      if (!parentContainer) {
        return false;
      }

      const periphery = parentContainer.querySelector(
        "#tabbrowser-arrowscrollbox-periphery"
      );
      parentContainer.insertBefore(group, periphery || null);
      group.setAttribute("data-atg-parent-id", parentGroup.id);
      group.setAttribute(
        "zen-workspace-id",
        this.getGroupWorkspaceId(parentGroup) || this.getGroupWorkspaceId(group) || ""
      );
      this.processGroup(group);
      this.processGroup(parentGroup);
      this.syncGroupColorVars(group);
      this.syncGroupColorVars(parentGroup);

      if (save) {
        this.syncSavedParentsFromDom();
      }

      document.querySelector("zen-library")?.update?.(true);
      setTimeout(() => this.updateGroupVisibility(), 50);
      return true;
    } catch (error) {
      console.error("[AdvancedTabGroups] Error nesting group:", error);
      return false;
    }
  }

  unnestGroup(group, { save = true } = {}) {
    try {
      if (!group || group.hasAttribute("split-view-group")) {
        return false;
      }

      const currentParent = this.getDomParentGroup(group);
      const rootContainer = this.getRootTabContainer(currentParent || group);
      if (!rootContainer) {
        return false;
      }

      const periphery = rootContainer.querySelector(
        "#tabbrowser-arrowscrollbox-periphery"
      );
      const insertBefore = currentParent?.nextSibling || periphery || null;
      rootContainer.insertBefore(group, insertBefore);
      group.removeAttribute("data-atg-parent-id");
      this.processGroup(group);
      this.syncGroupColorVars(group);

      if (save) {
        this.removeSavedParentTree(group.id);
        this.syncSavedParentsFromDom();
      }

      document.querySelector("zen-library")?.update?.(true);
      setTimeout(() => this.updateGroupVisibility(), 50);
      return true;
    } catch (error) {
      console.error("[AdvancedTabGroups] Error moving group to top level:", error);
      return false;
    }
  }

  setupDragAndDropSync() {
    if (this._dragAndDropSyncAdded) {
      return;
    }
    this._dragAndDropSyncAdded = true;

    // NOTE: We intentionally do NOT call dataTransfer.setDragImage() here.
    // Zen's ZenDragAndDrop.startTabDrag() owns the drag ghost
    // (#createDragImageForTabs). A second setDragImage from the mod races
    // native and causes the wrong size/offset that felt non-native.
    // Hierarchy persistence only observes the real DOM moves native makes.
    const scheduleSync = () => this.scheduleSavedParentsSync();
    const syncEvents = [
      "drop",
      "TabMove",
      "TabGroupCreate",
      "TabGroupRemoved",
      "FolderGrouped",
      "FolderUngrouped",
    ];

    for (const eventName of syncEvents) {
      document.addEventListener(eventName, scheduleSync, true);
    }
    // Re-sync after a native drag finishes (native fires dragend on the
    // tab container; no custom preview cleanup needed anymore).
    document.addEventListener("dragend", scheduleSync, true);

    const observer = new MutationObserver(mutations => {
      const touchedGroupTree = mutations.some(mutation => {
        if (mutation.type !== "childList") {
          return false;
        }
        const nodes = [
          ...mutation.addedNodes,
          ...mutation.removedNodes,
        ];
        return nodes.some(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return false;
          }
          return node.matches?.("tab-group, .tab-group-container") ||
            node.querySelector?.("tab-group, .tab-group-container");
        });
      });

      if (touchedGroupTree) {
        this.scheduleSavedParentsSync();
      }
    });

    observer.observe(gBrowser.tabContainer || document.body, {
      childList: true,
      subtree: true,
    });
    this._dragAndDropSyncObserver = observer;
  }

  setupGroupDropTargeting() {
    // Zen's native drag pipeline already understands nested tab groups
    // (tabgroup-js.patch: childGroupsAndTabs/group/visible/level, tabs-js.patch:
    // ariaFocusableItems). Do NOT override dragAndDropElements or those
    // accessors here — earlier ATG versions did and the duplicated
    // elementIndex bookkeeping drifted from native, breaking drop math.
    try {
      const TabGroupClass =
        window.MozTabbrowserTabGroup || customElements.get("tab-group");
      const proto = TabGroupClass?.prototype;
      const missing = ["groupContainer", "group", "visible", "childGroupsAndTabs"]
        .filter(key => !proto || !(key in proto));
      if (missing.length) {
        console.warn(
          "[AdvancedTabGroups] Native tab-group drag APIs missing:",
          missing.join(", "),
          "— nested drag targeting may be degraded on this Zen version."
        );
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error checking native group drag APIs:", error);
    }

    if (this._groupDropTargetingAdded) {
      return;
    }
    this._groupDropTargetingAdded = true;

    // Mirror Zen folder edge behavior for ATG group headers so tabs can be
    // placed ABOVE / BELOW a group instead of always dropping INTO it.
    //
    // Native ZenDragAndDrop.#applyDragoverIndicator resolves
    // event.target.closest(':is(.zen-drop-target)'):
    // - header (.zen-drop-target) hit -> background highlight -> drop INTO.
    // - no hit -> geometric getOverlappedElement -> line indicator -> reorder.
    // Folders get edge zones via zen.tabs.folder-dragover-threshold-percent
    // (top/bottom ~20% = line/reorder, middle = background/into). ATG headers
    // had no such zones, so every pixel dropped into the group.
    //
    // We get the same feel without forking private native methods by toggling
    // the header's zen-drop-target class per pointer position: edges remove it
    // (native falls back to reorder math + line indicator), middle restores it
    // (native shows background highlight + drop-into). Restored on drop/end.
    document.addEventListener("dragover", event => {
      this.updateGroupHeaderDropZone(event);
    }, true);
    for (const endEvent of ["drop", "dragend", "dragleave"]) {
      document.addEventListener(endEvent, () => {
        this.restoreGroupHeaderDropZones();
      }, true);
    }
  }

  getFolderDragoverThreshold() {
    try {
      const raw = Services.prefs.getIntPref(
        "zen.tabs.folder-dragover-threshold-percent",
        20
      );
      return Math.min(0.45, Math.max(0.05, raw / 100));
    } catch {
      return 0.2;
    }
  }

  updateGroupHeaderDropZone(event) {
    try {
      const types = event.dataTransfer?.types;
      const isTabDrag = !types ||
        Array.from(types).includes("application/x-moz-tab") ||
        Array.from(types).includes("text/tab");
      if (event.dataTransfer && types && !isTabDrag) {
        return;
      }
      const container = event.target?.closest?.(".tab-group-label-container");
      const group = container?.closest?.("tab-group");
      if (!group || !this.isManagedTabGroup(group)) {
        if (this._edgeZoneHeader && !this._edgeZoneHeader.isConnected) {
          this._edgeZoneHeader = null;
        }
        return;
      }
      // Never interfere with folder / split-view / essentials drags.
      if (group.hasAttribute("split-view-group")) {
        return;
      }

      const rect = container.getBoundingClientRect?.();
      if (!rect?.height) {
        return;
      }
      const threshold = this.getFolderDragoverThreshold();
      const overlap = (event.clientY - rect.top) / rect.height;
      const childCount = group.childGroupsAndTabs?.length ??
        group.querySelectorAll?.(":scope > .tab-group-container > tab, :scope > .tab-group-container > tab-group").length ??
        0;
      const isEdge = overlap < threshold ||
        (overlap > 1 - threshold &&
          (group.collapsed || group.hasAttribute("collapsed") || childCount < 2));

      if (isEdge) {
        // Reorder intent: hide header from native closest('.zen-drop-target')
        // so native draws the line indicator above/below instead of the
        // group background highlight.
        if (container.classList.contains("zen-drop-target")) {
          container.classList.remove("zen-drop-target");
          container.setAttribute("data-atg-edge-reorder", "true");
          this._edgeZoneHeader = container;
        }
      } else if (container.hasAttribute("data-atg-edge-reorder")) {
        container.classList.add("zen-drop-target");
        container.removeAttribute("data-atg-edge-reorder");
        if (this._edgeZoneHeader === container) {
          this._edgeZoneHeader = null;
        }
      } else if (this._edgeZoneHeader && this._edgeZoneHeader !== container) {
        this.restoreGroupHeaderDropZones();
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error updating group drop zone:", error);
    }
  }

  restoreGroupHeaderDropZones() {
    try {
      if (this._edgeZoneHeader?.isConnected) {
        this._edgeZoneHeader.classList.add("zen-drop-target");
        this._edgeZoneHeader.removeAttribute("data-atg-edge-reorder");
      }
      this._edgeZoneHeader = null;
      // Safety net in case a drag ended mid-edge on a different header.
      document.querySelectorAll?.(
        '.tab-group-label-container[data-atg-edge-reorder]'
      ).forEach(el => {
        el.classList.add("zen-drop-target");
        el.removeAttribute("data-atg-edge-reorder");
      });
    } catch (_) {}
  }

  isManagedTabGroup(group) {
    return !!(
      group &&
      group.localName === "tab-group" &&
      !group.hasAttribute("split-view-group") &&
      !group.classList.contains("zen-folder") &&
      !group.hasAttribute("zen-folder") &&
      !this.isLibraryGroupCopy(group)
    );
  }

  scheduleSavedParentsSync() {
    if (this._parentsSyncTimer) {
      clearTimeout(this._parentsSyncTimer);
    }
    this._parentsSyncTimer = setTimeout(() => {
      this._parentsSyncTimer = null;
      this.syncSavedParentsFromDom();
    }, 150);
  }

  syncSavedParentsFromDom() {
    try {
      // Native may fire sync while an edge-reorder header is still stripped
      // of zen-drop-target — restore first so later dragover math is stable.
      this.restoreGroupHeaderDropZones?.();
      const parents = {};
      for (const group of this.tabGroups) {
        if (
          !group.id ||
          !group.isConnected ||
          group.hasAttribute("drag-image") ||
          group.hasAttribute("split-view-group") ||
          group.classList.contains("zen-folder") ||
          group.hasAttribute("zen-folder")
        ) {
          continue;
        }

        this.ensureGroupContainer(group);
        const parentGroup = this.getDomParentGroup(group);
        if (
          parentGroup &&
          parentGroup.id &&
          !parentGroup.hasAttribute("split-view-group") &&
          !this.wouldCreateParentCycle(group, parentGroup)
        ) {
          parents[group.id] = parentGroup.id;
          group.setAttribute("data-atg-parent-id", parentGroup.id);
        } else {
          group.removeAttribute("data-atg-parent-id");
        }
      }

      this.savedParents = parents;
      document.querySelector("zen-library")?.update?.(true);
    } catch (error) {
      console.error("[AdvancedTabGroups] Error syncing group hierarchy after drag/drop:", error);
    }
  }

  getWorkspaces(includeSynced = false) {
    const workspaces = window.gZenWorkspaces?.getWorkspaces?.(includeSynced);
    if (Array.isArray(workspaces)) {
      return workspaces;
    }
    if (Array.isArray(workspaces?.workspaces)) {
      return workspaces.workspaces;
    }
    return [];
  }

  getGroupTabs(group) {
    return Array.from(group?.tabs || []).filter(
      tab =>
        gBrowser.isTab(tab) &&
        !tab.hasAttribute("zen-empty-tab") &&
        !tab.hasAttribute("zen-essential")
    );
  }

  getGroupWorkspaceId(group) {
    return (
      group?.getAttribute?.("zen-workspace-id") ||
      this.getGroupTabs(group)[0]?.getAttribute("zen-workspace-id") ||
      window.gZenWorkspaces?.activeWorkspace ||
      null
    );
  }

  restoreGroupTabsAfterWorkspaceMove(group, tabs) {
    const tabContainer = group?.querySelector?.(".tab-group-container");
    if (!group || !tabContainer || !Array.isArray(tabs)) {
      return;
    }

    const periphery =
      tabContainer.querySelector("#tabbrowser-arrowscrollbox-periphery") ||
      null;

    for (const tab of tabs) {
      if (!gBrowser.isTab(tab)) {
        continue;
      }

      tabContainer.insertBefore(tab, periphery);
    }
  }

  populateMoveGroupToSpaceMenu(popup) {
    while (popup.firstChild) {
      popup.firstChild.remove();
    }

    const group = this._contextMenuCurrentGroup;
    const currentWorkspaceId = this.getGroupWorkspaceId(group);
    const workspaces = this.getWorkspaces();

    for (const workspace of workspaces) {
      if (!workspace?.uuid) {
        continue;
      }

      const item = document.createXULElement("menuitem");
      item.setAttribute("label", workspace.name || "Unnamed Space");
      item.setAttribute("zen-workspace-id", workspace.uuid);
      item.toggleAttribute("disabled", workspace.uuid === currentWorkspaceId);
      item.addEventListener("command", () => {
        this.moveGroupToWorkspace(group, workspace.uuid);
      });
      popup.appendChild(item);
    }
  }

  moveGroupToWorkspace(group, workspaceId) {
    try {
      if (!group || !workspaceId || !window.gZenWorkspaces) {
        return;
      }

      const tabs = this.getGroupTabs(group);
      if (!tabs.length) {
        return;
      }

      const targetWorkspace = window.gZenWorkspaces.getWorkspaceFromId?.(
        workspaceId
      );
      const targetElement = window.gZenWorkspaces.workspaceElement?.(
        workspaceId
      );
      const targetContainer =
        targetElement?.tabsContainer ||
        targetElement?.querySelector?.(".zen-workspace-normal-tabs-section");

      for (const tab of tabs) {
        window.gZenWorkspaces.moveTabToWorkspace?.(tab, workspaceId);
        tab.setAttribute("zen-workspace-id", workspaceId);
      }

      group.setAttribute("zen-workspace-id", workspaceId);
      if (targetContainer && group.isConnected) {
        const periphery = targetContainer.querySelector(
          "#tabbrowser-arrowscrollbox-periphery"
        );
        targetContainer.insertBefore(group, periphery || null);
      }
      this.restoreGroupTabsAfterWorkspaceMove(group, tabs);
      this.processGroup(group);

      if (targetWorkspace && tabs.some(tab => tab.selected)) {
        window.gZenWorkspaces.lastSelectedWorkspaceTabs[workspaceId] =
          tabs.find(tab => tab.selected) || tabs[0];
        window.gZenWorkspaces.changeWorkspace(targetWorkspace);
      }

      this.updateGroupVisibility();
      setTimeout(() => this.updateGroupVisibility(), 100);
    } catch (error) {
      console.error("[AdvancedTabGroups] Error moving group to space:", error);
    }
  }

  addFolderContextMenuItems() {
    // Use a timeout to ensure the menu exists, as it's created by another component
    setTimeout(() => {
      const folderMenu = document.getElementById("zenFolderActions");
      if (!folderMenu || folderMenu.querySelector("#convert-folder-to-group")) {
        return; // Already exists or menu not found
      }

      const menuFragment = window.MozXULElement.parseXULToFragment(`
        <menuitem id="convert-folder-to-group" label="Convert Folder to Group"/>
      `);

      const convertToSpaceItem = folderMenu.querySelector(
        "#context_zenFolderToSpace"
      );
      if (convertToSpaceItem) {
        convertToSpaceItem.after(menuFragment);
      } else {
        // Fallback if the reference item isn't found
        folderMenu.appendChild(menuFragment);
      }

      folderMenu.addEventListener("command", (event) => {
        if (event.target.id === "convert-folder-to-group") {
          const triggerNode = folderMenu.triggerNode;
          if (!triggerNode) {
            console.error(
              "[AdvancedTabGroups] Could not find trigger node for folder context menu."
            );
            return;
          }
          const folder = triggerNode.closest("zen-folder");
          if (folder) {
            this.convertFolderToGroup(folder);
          } else {
            console.error(
              "[AdvancedTabGroups] Could not find folder from trigger node:",
              triggerNode
            );
          }
        }
      });
    }, 1500);
  }

  updateIconColor(group, colors) {
    const groupIcon = group.querySelector(".group-icon");
    if (!groupIcon) {
      return;
    }
    // Full-color uploads (PNG/JPG photos) render as-is; only monochrome
    // SVGs get the contrast fill.
    try {
      const src = groupIcon.getAttribute?.("src") || "";
      if (src && this.isRasterGroupIcon(src)) {
        groupIcon.style.fill = "";
        groupIcon.style.stroke = "";
        return;
      }
    } catch (_) {}
    let useBlack = null;
    try {
      const input = typeof colors?.[0] === "object"
        ? gZenThemePicker.getMostDominantColor(colors)
        : colors;
      // If the background is dark mode, we need the contrast of that (opposite).
      const decided = !gZenThemePicker.shouldBeDarkMode(input);
      if (typeof decided === "boolean") {
        useBlack = decided;
      }
    } catch (_) {}
    if (useBlack === null) {
      // No gradient data (favicon/native color groups) or picker hiccup:
      // derive contrast from the group's live color so uploads theme
      // everywhere, not just on gradient groups.
      useBlack = this.groupNeedsBlackIcon(group);
    }
    const contrast = useBlack ? "black" : "white";
    // Prefer the exact CSS icon color (.tab-group-icon-container's resolved
    // stroke color) so uploads match built-ins by construction; fall back to
    // the computed contrast when CSS gives nothing usable.
    const paint = this.cssIconColor(group) || contrast;
    try {
      // Normalized upload? Bake the paint into the rendered copy so it
      // shows correctly even where context-fill doesn't resolve through
      // <image>. Storage keeps the context original; recolors rebake.
      const stored = this.savedIcons?.[group.id];
      if (this.hasContextPaint(stored)) {
        const baked = this.bakeGroupIconSvg(stored, paint);
        if (baked && groupIcon.getAttribute("src") !== baked) {
          groupIcon.setAttribute("src", baked);
        }
        groupIcon.style.fill = "";
        groupIcon.style.stroke = "";
        return;
      }
    } catch (_) {}
    // Driven into context-fill SVGs (built-in) via -moz-context-properties
    // on .group-icon; harmless for currentColor/raster icons, which don't
    // consult these properties.
    groupIcon.style.fill = paint;
    groupIcon.style.stroke = paint;
  }

  // Handle platform-dispatched creation event for groups
  onTabGroupCreate(event) {
    try {
      const target = event.target;
      const group = target?.closest
        ? target.closest("tab-group") ||
          (target.tagName === "tab-group" ? target : null)
        : null;
      if (!group) return;

      // Library spaces-section copies fire this too; the section owns them.
      if (this.isLibraryGroupCopy(group)) {
        return;
      }

      // Skip split-view-groups
      if (group.hasAttribute("split-view-group")) {
        return;
      }

      // Remove built-in menu that may be created alongside new groups
      this.removeBuiltinTabGroupMenu();

      // Ensure group gets processed (buttons/context menu) if not already
      if (!group.hasAttribute("data-close-button-added")) {
        this.processGroup(group);
      }

      // Auto-start rename and apply favicon color when newly created
      if (
        !group.label ||
        group.label === "" ||
        ("defaultGroupName" in group && group.label === group.defaultGroupName)
      ) {
        if (!this._groupEdited) {
          this.renameGroupStart(group, false); // Don't select all for new groups
        }
        // Set color to favicon mode (default for new groups)
        group.color = `${group.id}-favicon`;
        if (typeof group._useFaviconColor === "function") {
          setTimeout(() => group._useFaviconColor(), 300);
        }
      }

      // Update group visibility
      setTimeout(() => this.updateGroupVisibility(), 100);
    } catch (e) {
      console.error("[AdvancedTabGroups] Error handling TabGroupCreate:", e);
    }
  }

  addContextMenu(group) {
    // Prevent duplicate listener wiring per group
    if (group._contextMenuAdded) return;
    group._contextMenuAdded = true;

    // Create shared menu once
    const sharedMenu = this.ensureSharedContextMenu();

    // Attach context menu only to the label container
    const labelContainer = group.querySelector(".tab-group-label-container");
    if (labelContainer) {
      // Strip default context attribute to prevent built-in menu
      labelContainer.removeAttribute("context");
      
      // Remove any existing context menu listeners
      const existingListener = labelContainer._contextMenuListener;
      if (existingListener) {
        labelContainer.removeEventListener("contextmenu", existingListener);
      }
      
      // Create new context menu listener
      const contextMenuListener = (event) => {
        event.preventDefault();
        event.stopPropagation();
        console.log("[AdvancedTabGroups] Context menu triggered for group:", group.id);
        this._contextMenuCurrentGroup = group;
        sharedMenu.openPopupAtScreen(event.screenX, event.screenY, false);
      };
      
      // Store reference to listener for potential cleanup
      labelContainer._contextMenuListener = contextMenuListener;
      labelContainer.addEventListener("contextmenu", contextMenuListener);
      
      console.log("[AdvancedTabGroups] Context menu attached to group:", group.id);
    } else {
      console.warn("[AdvancedTabGroups] Label container not found for group:", group.id);
    }

    // Also strip any context attribute from the group itself
    group.removeAttribute("context");

    // Add methods to the group for context menu actions (used by commands)
    group._renameGroupFromContextMenu = () => {
      this.renameGroupStart(group);
    };

    group._closeGroupFromContextMenu = () => {
      try {
        // Remove the group's saved color, icon, and collapsed state before removing the group
        this.removeSavedColor(group.id);
        this.removeSavedIcon(group.id);
        this.removeSavedParent(group.id);
        this.removeSavedCollapsedState(group.id);

        gBrowser.removeTabGroup(group);
        
      } catch (error) {
        console.error(
          "[AdvancedTabGroups] Error closing group via context menu:",
          error
        );
      }
    };

    group._collapseGroupFromContextMenu = () => {
      if (group.hasAttribute("collapsed")) {
        group.removeAttribute("collapsed");
        
      } else {
        group.setAttribute("collapsed", "true");
        
      }
    };

    group._expandGroupFromContextMenu = () => {
      group.removeAttribute("collapsed");
    };

    group._setGroupColor = async () => {
      let faviconColor; 
      if (group.color.endsWith("favicon")) {
        faviconColor = await group._useFaviconColor();
      }
      group.color = group.id;

      // Check if the gradient picker is available
      if (window.gZenThemePicker) {
        // Try to find and click an existing button that opens the gradient picker
        try {
          // Look for the existing button that opens the gradient picker
          const existingButton = document.getElementById(
            "zenToolbarThemePicker"
          );
          if (existingButton) {
            // Store original methods for restoration
            const originalUpdateMethod =
              window.gZenThemePicker.updateCurrentWorkspace;

            const resetPickerDots = () => {
                for (const dot of gZenThemePicker.panel.querySelectorAll(".zen-theme-picker-dot")) {
                  dot.remove();
                }
                gZenThemePicker.dots = [];
            }

            const calculateColor = () => {
              const dots = gZenThemePicker.panel.querySelectorAll(".zen-theme-picker-dot");
              const colors = Array.from(dots)
                .sort((a, b) => a.getAttribute("data-index") - b.getAttribute("data-index"))
                .map((dot) => {
                  const color = dot.style.getPropertyValue("--zen-theme-picker-dot-color");
                  const isPrimary = dot.classList.contains("primary");

                  if (color === "undefined") {
                    return null;
                  }
                  const isCustom = dot.classList.contains("custom");
                  const algorithm = this.useAlgo;
                  const position =
                    dot.getAttribute("data-position") && JSON.parse(dot.getAttribute("data-position"));
                  const type = dot.getAttribute("data-type");
                  return {
                    c: isCustom ? color : color.match(/\d+/g).map(Number),
                    isCustom,
                    algorithm,
                    isPrimary,
                    lightness: 50,
                    position,
                    type,
                  };
                })
                .filter((color) => Boolean(color));
              
              let gradient;
              if (colors.length > 0) {
                gradient = gZenThemePicker.getGradient(colors);
                
                this.updateIconColor(group, colors);
              } else {
                gradient = "transparent";

                const groupIcon = group.querySelector(".group-icon");
                if (groupIcon) {
                  groupIcon.style.fill = "light-dark(black, white)";
                }
              }
            
              // Set the --tab-group-color CSS variable on the group
              document.documentElement.style.setProperty(
                `--tab-group-color-${group.id}`,
                gradient
              );
            
              document.documentElement.style.setProperty(
                `--tab-group-color-${group.id}-invert`,
                gradient
              );

              group.style.setProperty("--group-grain", gZenThemePicker.currentTexture);
              group.setAttribute("show-grain", gZenThemePicker.currentTexture > 0);
              this.syncGroupColorVars(group);
            
              return colors;
            }

            const clickToAdd = document.querySelector("#PanelUI-zen-gradient-generator-color-click-to-add");

            let theme = this.savedColors[group.id];

            // Override the updateCurrentWorkspace method to prevent browser background changes
            window.gZenThemePicker.updateCurrentWorkspace = () => {
              // Apply the color to our tab group
              try {
                const colors = calculateColor();
                if (colors && colors.length) {
                  clickToAdd.setAttribute("hidden", "true");
                } else {
                  clickToAdd.removeAttribute("hidden");
                }
                
                const originalUpdateNoise = gZenThemePicker.updateNoise;
                gZenThemePicker.updateNoise = () => {};
                Object.defineProperty(gZenThemePicker, "toolbarBackgroundElement", {
                  get() { return null; },
                  configurable: true,
                });
                Object.defineProperty(gZenThemePicker, "browserBackgroundElement", {
                  get() { return null; },
                  configurable: true,
                });
                const fakeWindow = {
                  document: {
                    documentElement: {
                      style: {
                        setProperty: () => {},
                      },
                      setAttribute: () => {},
                      removeAttribute: () => {},
                    },
                    getElementById: document.getElementById.bind(document),
                    querySelectorAll: document.querySelectorAll.bind(document),
                  },
                  gZenThemePicker,
                  gZenWorkspaces: {
                    getActiveWorkspace: () => {
                      return { uuid: group.id };
                    },
                    workspaceElement: () => {
                      return null;
                    },
                  },
                  windowUtils,
                }

                const originalWm = Services.wm;
                Services.wm = {
                  getEnumerator: () => {
                    return [fakeWindow];
                  }
                }

                gZenThemePicker.onWorkspaceChange(
                  { uuid: group.id },
                  true,
                  {
                    type: undefined,
                    gradientColors: colors,
                    opacity: gZenThemePicker.currentOpacity,
                    texture: gZenThemePicker.currentTexture
                  }
                );

                Services.wm = originalWm;
                gZenThemePicker.updateNoise = originalUpdateNoise;
                delete gZenThemePicker.toolbarBackgroundElement;
                delete gZenThemePicker.browserBackgroundElement;
              } catch (error) {
                console.error(
                  "[AdvancedTabGroups] Error applying color to group:",
                  error
                );
              }
            };

            // Now click the button to open the picker
            existingButton.click();

            resetPickerDots();

            const previousOpacity = gZenThemePicker.currentOpacity;
            const previousTexture = gZenThemePicker.currentTexture;

            if (faviconColor) {
              theme = {
                gradientColors: [
                  {
                    c: faviconColor,
                    isCustom: false,
                    isPrimary: true,
                    lightness: 50,
                    position: gZenThemePicker.calculateInitialPosition(faviconColor),
                    type: "undefined"
                  }
                ],
                opacity: 1,
                texture: 0
              }
            }

            if (theme && typeof theme === "object" && theme.gradientColors?.length) {
              clickToAdd.setAttribute("hidden", "true");
              gZenThemePicker.recalculateDots(theme.gradientColors ?? []);
              gZenThemePicker.currentOpacity = theme.opacity;
              gZenThemePicker.currentTexture = theme.texture;
            }

            // Set up a listener for when the panel closes to apply the final color and cleanup
            const panel = window.gZenThemePicker.panel;
            const handlePanelClose = () => {
              try {
                // Get the final color from the dots using the same logic
                const colors = this.savedColors;
                colors[group.id] = {
                  gradientColors: calculateColor(),
                  opacity: gZenThemePicker.currentOpacity,
                  texture: gZenThemePicker.currentTexture
                };
                this.savedColors = colors;

                // CRITICAL: Clean up all references and restore original methods
                gZenThemePicker.updateCurrentWorkspace = originalUpdateMethod;
                gZenThemePicker.currentOpacity = previousOpacity;
                gZenThemePicker.currentTexture = previousTexture;

                resetPickerDots();
                gZenThemePicker.recalculateDots(
                  gZenWorkspaces.getActiveWorkspace().theme.gradientColors
                );

                // Remove the event listener
                panel.removeEventListener("popuphidden", handlePanelClose);
              } catch (error) {
                console.error(
                  "[AdvancedTabGroups] Error during cleanup:",
                  error
                );
              }
            };

            panel.addEventListener("popuphidden", handlePanelClose);
          }
        } catch (error) {
          console.error(
            "[AdvancedTabGroups] Error opening gradient picker:",
            error
          );
        }
      } else {
        console.warn("[AdvancedTabGroups] Gradient picker not available");
      }
    };

    group._useFaviconColor = async () => {
      // Capture 'this' for use in callbacks
      const self = this;

      try {
        // Get all favicon images directly from the group
        const favicons = group.querySelectorAll(".tab-icon-image");

        // Extract colors from favicons
        const colors = [];

        for (const [index, favicon] of Array.from(favicons).entries()) {
          if (favicon && favicon.src && favicon.src !== "chrome://global/skin/icons/defaultFavicon.svg") {
            // Create a canvas to analyze the favicon
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const img = new Image();

            // Set crossOrigin to handle CORS issues
            img.crossOrigin = "anonymous";

            let processedResolve;
            const processedPromise = new Promise(r => processedResolve = r);

            img.onload = () => {
              try {
                canvas.width = img.width || 16;
                canvas.height = img.height || 16;
                ctx.drawImage(img, 0, 0);

                const imageData = ctx.getImageData(
                  0,
                  0,
                  canvas.width,
                  canvas.height
                );
                const data = imageData.data;

                // Sample pixels and extract colors
                let r = 0,
                  g = 0,
                  b = 0,
                  count = 0;
                for (let i = 0; i < data.length; i += 4) {
                  // Skip transparent pixels and very dark pixels
                  if (
                    data[i + 3] > 128 &&
                    data[i] + data[i + 1] + data[i + 2] > 30
                  ) {
                    r += data[i];
                    g += data[i + 1];
                    b += data[i + 2];
                    count++;
                  }
                }

                if (count > 0) {
                  const avgColor = [
                    Math.round(r / count),
                    Math.round(g / count),
                    Math.round(b / count),
                  ];
                  colors.push(avgColor);
                }

                processedResolve(true);
              } catch (error) {
                console.error(
                  "[AdvancedTabGroups] Error processing favicon",
                  index + 1,
                  ":",
                  error
                );
              }
            };

            img.onerror = () => {
              console.warn("[AdvancedTabGroups] Failed to load favicon:", favicon.src);
              processedResolve(true);
            };

            // Add timeout to prevent hanging
            setTimeout(() => {
              if (img.complete === false) {
                console.warn("[AdvancedTabGroups] Favicon load timeout:", favicon.src);
                processedResolve(true);
              }
            }, 3000);

            img.src = favicon.src;

            await processedPromise;
          }
        };

        if (colors.length > 0) {
          this.getGroupById(group.id).color = `${group.id}-favicon`;

          const finalColor = self._calculateAverageColor(colors);
          const colorString = `rgb(${finalColor[0]}, ${finalColor[1]}, ${finalColor[2]})`;
        
          document.documentElement.style.setProperty(`--tab-group-color-${group.id}-favicon`, colorString);
          document.documentElement.style.setProperty(
            `--tab-group-color-${group.id}-favicon-invert`,
            colorString
          );
          // A picker colour left on the root would outrank the favicon one in getGroupColorValue
          document.documentElement.style.removeProperty(`--tab-group-color-${group.id}`);
          document.documentElement.style.removeProperty(`--tab-group-color-${group.id}-invert`);
          self.syncGroupColorVars(group);
        
          this.updateIconColor(group, finalColor);
          // Persist the result: on restart the favicons are not all loaded yet, so recomputing then
          // gives a different average. applySavedColors replays this and processGroup skips the recompute.
          const savedColors = self.savedColors;
          savedColors[group.id] = { favicon: colorString };
          self.savedColors = savedColors;

          return finalColor;
        }
      } catch (error) {
        console.error(
          "[AdvancedTabGroups] Error extracting favicon colors:",
          error
        );
      }
    };
  }

  ungroupTabs(group) {
    try {
      if (!group) return;
      const tabs = this.getGroupTabs(group);
      const rawTabs = Array.from(group.tabs || []);
      const targetTabs = tabs.length ? tabs : rawTabs;
      let done = false;
      if (typeof group.ungroupTabs === "function") {
        try {
          group.ungroupTabs();
          if (!group.tabs?.length && !group.querySelectorAll("tab").length) done = true;
        } catch (_) {}
      }
      if (!done && targetTabs.length && typeof gBrowser.ungroupTab === "function") {
        targetTabs.slice().forEach(tab => { try { gBrowser.ungroupTab(tab); } catch (_) {} });
        done = true;
      }
      if (!done && targetTabs.length) {
        const parent = group.parentNode;
        const next = group.nextSibling;
        targetTabs.slice().forEach(tab => {
          try {
            tab.removeAttribute("tab-group-id");
            if (parent) parent.insertBefore(tab, next);
          } catch (_) {}
        });
        setTimeout(() => { try { if (group.isConnected) group.remove(); } catch (_) {} }, 50);
      }
      if (!targetTabs.length) {
        try { gBrowser.removeTabGroup?.(group); } catch (_) {}
        try { if (group.isConnected) group.remove(); } catch (_) {}
      }
      this.removeSavedColor(group.id);
      this.removeSavedIcon(group.id);
      this.removeSavedParentTree(group.id);
      this.removeSavedCollapsedState(group.id);
    } catch (error) {
      console.error("[AdvancedTabGroups] Error ungrouping tabs:", error);
    }
  }

  // Close the group together with every tab in it (Ungroup only dissolves the row). Persisted
  // state goes with TabGroupRemoved, so a close the user cancels at a beforeunload prompt keeps it.
  deleteGroup(group) {
    try {
      if (group?.isConnected) gBrowser.removeTabGroup(group);
    } catch (error) {
      console.error("[AdvancedTabGroups] Error deleting group:", error);
    }
  }

  // Everything ATG persists for a group, keyed by its id
  removeSavedGroupState(groupId) {
    this.removeSavedColor(groupId);
    this.removeSavedIcon(groupId);
    this.removeSavedParentTree(groupId);
    this.removeSavedCollapsedState(groupId);
  }

  // New method to convert group to folder
  convertGroupToFolder(group) {
    try {
      // Check if Zen folders functionality is available
      if (!window.gZenFolders) {
        console.error(
          "[AdvancedTabGroups] Zen folders functionality not available"
        );
        return;
      }

      // Get all tabs in the group
      const tabs = Array.from(group.tabs);
      if (tabs.length === 0) {
        return;
      }

      // Get the group name for the new folder
      const groupName = group.label || "New Folder";

      // Create a new folder using Zen folders functionality
      const newFolder = window.gZenFolders.createFolder(tabs, {
        label: groupName,
        renameFolder: false, // Don't prompt for rename since we're using the group name
        workspaceId:
          group.getAttribute("zen-workspace-id") ||
          window.gZenWorkspaces?.activeWorkspace,
      });

      if (newFolder) {
        // A folder has no colour of its own; keep the group's for a later convert back
        newFolder._atgColorMemo = this.captureGroupColor(group);

        // Remove the original group
        try {
          gBrowser.removeTabGroup(group);
          
        } catch (error) {
          console.error(
            "[AdvancedTabGroups] Error removing original group:",
            error
          );
        }

        // Remove the saved color, icon, and collapsed state for the original group
        this.removeSavedColor(group.id);
        this.removeSavedIcon(group.id);
        this.removeSavedParentTree(group.id);
        this.removeSavedCollapsedState(group.id);

        
      } else {
        console.error("[AdvancedTabGroups] Failed to create folder");
      }
    } catch (error) {
      console.error(
        "[AdvancedTabGroups] Error converting group to folder:",
        error
      );
    }
  }

  // Zen's folder collapse leaves opacity/height inline on hidden rows and only clears them while the tab is in the folder
  clearFolderRowStyles(tab) {
    tab.getAnimations().forEach((animation) => animation.cancel());
    for (const prop of ["opacity", "height", "min-height", "margin-top", "--zen-folder-indent"]) {
      tab.style.removeProperty(prop);
    }
    tab.removeAttribute("folder-active");
  }

  convertFolderToGroup(folder) {
    try {
      const tabsToGroup = folder.allItemsRecursive.filter(
        (item) => gBrowser.isTab(item) && !item.hasAttribute("zen-empty-tab")
      );

      const folderName = folder.label || "New Group";

      if (tabsToGroup.length === 0) {
        
        if (
          folder &&
          folder.isConnected &&
          typeof folder.delete === "function"
        ) {
          folder.delete();
        }
        return;
      }

      // Unpin all tabs before attempting to group them
      tabsToGroup.forEach((tab) => {
        if (tab.pinned) {
          gBrowser.unpinTab(tab);
        }
      });

      // Use a brief timeout to allow the UI to process the unpinning before creating the group.
      setTimeout(() => {
        try {
          const newGroup = document.createXULElement("tab-group");
          newGroup.id = `${Date.now()}-${Math.round(Math.random() * 100)}`;
          newGroup.label = folderName;

          const unpinnedTabsContainer =
            gZenWorkspaces.activeWorkspaceStrip ||
            gBrowser.tabContainer.querySelector("tabs");
          unpinnedTabsContainer.prepend(newGroup);

          newGroup.addTabs(tabsToGroup);
          tabsToGroup.forEach((tab) => this.clearFolderRowStyles(tab));
          // Colour saved by convertGroupToFolder, before processGroup defaults it to favicon mode
          this.restoreGroupColor(newGroup, folder._atgColorMemo);

          if (
            folder &&
            folder.isConnected &&
            typeof folder.delete === "function"
          ) {
            folder.delete();
          }

          this.processGroup(newGroup);

          
        } catch (groupingError) {
          console.error(
            "[AdvancedTabGroups] Error during manual group creation:",
            groupingError
          );
        }
      }, 200);
    } catch (error) {
      console.error(
        "[AdvancedTabGroups] Error converting folder to group:",
        error
      );
    }
  }

  // Helper method to calculate average color
  _calculateAverageColor(colors) {
    if (colors.length === 0) return [0, 0, 0];

    const total = colors.reduce(
      (acc, color) => {
        acc[0] += color[0];
        acc[1] += color[1];
        acc[2] += color[2];
        return acc;
      },
      [0, 0, 0]
    );

    return [
      Math.round(total[0] / colors.length),
      Math.round(total[1] / colors.length),
      Math.round(total[2] / colors.length),
    ];
  }

  // Helper method to determine contrast color (black or white) for a given background color
  _getContrastColor(backgroundColor) {
    try {
      // Parse the background color to get RGB values
      let r, g, b;

      if (backgroundColor.startsWith("rgb")) {
        // Handle rgb(r, g, b) format
        const match = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          r = parseInt(match[1]);
          g = parseInt(match[2]);
          b = parseInt(match[3]);
        }
      } else if (backgroundColor.startsWith("#")) {
        // Handle hex format
        const hex = backgroundColor.replace("#", "");
        r = parseInt(hex.substr(0, 2), 16);
        g = parseInt(hex.substr(2, 2), 16);
        b = parseInt(hex.substr(4, 2), 16);
      } else if (backgroundColor.startsWith("linear-gradient")) {
        // For gradients, extract the first color
        const match = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          r = parseInt(match[1]);
          g = parseInt(match[2]);
          b = parseInt(match[3]);
        }
      }

      if (r !== undefined && g !== undefined && b !== undefined) {
        // Calculate relative luminance using the sRGB formula
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Return 'white' for dark backgrounds, 'black' for light backgrounds
        return luminance > 0.5 ? "black" : "white";
      }
    } catch (error) {
      console.error(
        "[AdvancedTabGroups] Error calculating contrast color:",
        error
      );
    }

    // Default to black if we can't parse the color
    return "black";
  }

  get savedColors() {
    const colors = SessionStore.getCustomWindowValue(window, "tabGroupColors");
    console.log("[AdvancedTabGroups] Retrieved colors from SessionStore:", colors);
    if (colors && colors !== "") {
      try {
        const parsed = JSON.parse(colors);
        console.log("[AdvancedTabGroups] Parsed colors:", parsed);
        return parsed;
      } catch (error) {
        console.error("[AdvancedTabGroups] Error parsing saved colors:", error);
        return {};
      }
    }
    return {};
  }

  set savedColors(value) {
    try {
      console.log("[AdvancedTabGroups] Saving colors to SessionStore:", value);
      SessionStore.setCustomWindowValue(window, "tabGroupColors", JSON.stringify(value));
    } catch (error) {
      console.error("[AdvancedTabGroups] Error saving colors to SessionStore:", error);
    }
  }

  // A colour code that is not ours (blue, zen-workspace-color, a tab-wand rule name…): the native
  // setter owns the group's vars and anything ATG stored for the group is stale.
  hasNativeColor(group) {
    const code = String(group?.color || "");
    return !!code && !code.startsWith(group.id);
  }

  getGroupColorValue(group) {
    if (!group?.id) {
      return "";
    }

    const docStyle = getComputedStyle(document.documentElement);
    const groupStyle = getComputedStyle(group);
    return (
      docStyle.getPropertyValue(`--tab-group-color-${group.id}`).trim() ||
      docStyle.getPropertyValue(`--tab-group-color-${group.id}-favicon`).trim() ||
      groupStyle.getPropertyValue("--tab-group-color").trim()
    );
  }

  getGroupStrokeValue(group) {
    if (!group?.id) {
      return "";
    }

    const docStyle = getComputedStyle(document.documentElement);
    const groupStyle = getComputedStyle(group);
    return (
      docStyle.getPropertyValue(`--tab-group-color-${group.id}-invert`).trim() ||
      docStyle.getPropertyValue(`--tab-group-color-${group.id}-favicon-invert`).trim() ||
      groupStyle.getPropertyValue("--tab-group-stroke").trim()
    );
  }

  syncGroupColorVars(group) {
    // Section copies keep the vars they were cloned with; only real groups
    // sync (their copies refresh via refreshSpacesSectionGroupIcon below).
    if (!group?.id || group.hasAttribute("split-view-group") || this.isLibraryGroupCopy(group)) {
      return;
    }

    const colorTargets = [
      group,
      group.querySelector(".tab-group-label-container"),
      group.querySelector(".tab-group-icon-container"),
      group.querySelector(".tab-group-icon"),
      group.querySelector(".tab-group-container"),
    ].filter(Boolean);

    // Another mod (tab-wand's rules on TabGroupCreate, Zen itself) took the colour over: let the
    // native cascade through and forget ours, or the sidebar and the Library disagree.
    if (this.hasNativeColor(group)) {
      const root = document.documentElement.style;
      for (const suffix of ["", "-invert", "-favicon", "-favicon-invert"]) {
        root.removeProperty(`--tab-group-color-${group.id}${suffix}`);
      }
      // The group element keeps --tab-group-color: that is where the native setter wrote the
      // colour. It never writes --tab-group-stroke, so that one is ours everywhere.
      for (const target of colorTargets) {
        if (target !== group) target.style.removeProperty("--tab-group-color");
        target.style.removeProperty("--tab-group-stroke");
      }
      if (this.savedColors[group.id]) this.removeSavedColor(group.id);
      return;
    }

    const color = this.getGroupColorValue(group);
    const stroke = this.getGroupStrokeValue(group);

    if (color) {
      colorTargets.forEach(target => target.style.setProperty("--tab-group-color", color));
    }

    if (stroke && !stroke.includes("gradient")) {
      colorTargets.forEach(target => target.style.setProperty("--tab-group-stroke", stroke));
    }

    // Recolors don't rebuild cards; push the fresh vars into copies.
    this.refreshSpacesSectionGroupIcon(group);
  }

  // Apply saved colors to tab groups
  applySavedColors() {
    try {
      Object.entries(this.savedColors).forEach(([groupId, color]) => {
        this.applySavedColor(groupId, color).catch((error) => {
          console.error("[AdvancedTabGroups] Error applying saved color:", groupId, error);
        });
      });
    } catch (error) {
      console.error("[AdvancedTabGroups] Error applying saved colors:", error);
    }
  }

  // Apply one savedColors entry: a gradient-picker object, a persisted favicon colour
  // ({ favicon: "rgb(...)" }) or, for backward compatibility, a plain colour string.
  async applySavedColor(groupId, color) {
    const root = document.documentElement.style;
    // Handle new format (object with gradientColors, opacity, texture)
    if (typeof color === 'object' && color.gradientColors) {
      const previousOpacity = gZenThemePicker.currentOpacity;
      gZenThemePicker.currentOpacity = color.opacity || 1;

      const gradient = gZenThemePicker.getGradient(color.gradientColors);
      root.setProperty(`--tab-group-color-${groupId}`, gradient);
      root.setProperty(`--tab-group-color-${groupId}-invert`, gradient);

      gZenThemePicker.currentOpacity = previousOpacity;

      const group = await this.waitForElm(`tab-group[id="${groupId}"]`);
      if (group) {
        this.syncGroupColorVars(group);
      }

      if (color.texture) {
        if (group) {
          group.style.setProperty("--group-grain", color.texture);
          group.setAttribute("show-grain", color.texture > 0);
        }
      }
    }
    // Favicon mode: replay the last computed average instead of resampling the favicons
    else if (typeof color === 'object' && typeof color.favicon === 'string' && color.favicon) {
      root.setProperty(`--tab-group-color-${groupId}-favicon`, color.favicon);
      root.setProperty(`--tab-group-color-${groupId}-favicon-invert`, color.favicon);
      const group = await this.waitForElm(`tab-group[id="${groupId}"]`);
      if (group) {
        // Another mod may have coloured it natively while we waited; that wins (see syncGroupColorVars)
        if (this.hasNativeColor(group)) {
          this.syncGroupColorVars(group);
          return;
        }
        if (!String(group.color || "").endsWith("favicon")) group.color = `${groupId}-favicon`;
        this.syncGroupColorVars(group);
        const rgb = color.favicon.match(/\d+/g)?.map(Number);
        if (rgb?.length >= 3) this.updateIconColor(group, rgb);
      }
    }
    // Handle old format (simple color string) for backward compatibility
    else if (typeof color === 'string' && color.trim() !== '') {
      root.setProperty(`--tab-group-color-${groupId}`, color);
      root.setProperty(`--tab-group-color-${groupId}-invert`, color);
      const group = await this.waitForElm(`tab-group[id="${groupId}"]`);
      if (group) {
        this.syncGroupColorVars(group);
      }
    }
  }

  // Everything that colours a group, independent of its id, so a replacement element (a folder
  // round-trip creates a new tab-group with a new id) can be coloured the same way.
  captureGroupColor(group) {
    if (!group?.id) return null;
    const saved = this.savedColors[group.id];
    if (saved) return { saved };
    const code = String(group.color || "");
    if (code.endsWith("favicon")) {
      const rgb = document.documentElement.style.getPropertyValue(`--tab-group-color-${group.id}-favicon`).trim();
      return rgb ? { saved: { favicon: rgb } } : { favicon: true };
    }
    // A native colour code (blue, zen-workspace-color, a tab-wand name…)
    return code && !code.startsWith(group.id) ? { native: code } : null;
  }

  // Counterpart of captureGroupColor. Call before processGroup runs on the new group so its
  // "no colour yet → favicon" default does not kick in.
  restoreGroupColor(group, memo) {
    if (!group?.id || !memo) return;
    try {
      if (memo.saved) {
        const colors = this.savedColors;
        colors[group.id] = memo.saved;
        this.savedColors = colors;
        group.color = memo.saved.favicon ? `${group.id}-favicon` : group.id;
        this.applySavedColor(group.id, memo.saved).catch(() => {});
      } else if (memo.favicon) {
        // Nothing to replay; processGroup recomputes it once it has attached _useFaviconColor
        group.color = `${group.id}-favicon`;
      } else if (memo.native) {
        group.color = memo.native;
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error restoring group color:", error);
    }
  }

  // Remove saved color for a specific tab group
  removeSavedColor(groupId) {
    try {
      const colors = this.savedColors;
      delete colors[groupId];
      this.savedColors = colors;
    } catch (error) {
      console.error("[AdvancedTabGroups] Error removing saved color:", error);
    }
  }

  get savedParents() {
    const parents = SessionStore.getCustomWindowValue(window, "tabGroupParents");
    console.log("[AdvancedTabGroups] Retrieved parent hierarchy from SessionStore:", parents);
    if (parents && parents !== "") {
      try {
        const parsed = JSON.parse(parents);
        console.log("[AdvancedTabGroups] Parsed parent hierarchy:", parsed);
        return parsed;
      } catch (error) {
        console.error("[AdvancedTabGroups] Error parsing saved parent hierarchy:", error);
        return {};
      }
    }
    return {};
  }

  set savedParents(value) {
    try {
      console.log("[AdvancedTabGroups] Saving parent hierarchy to SessionStore:", value);
      SessionStore.setCustomWindowValue(window, "tabGroupParents", JSON.stringify(value));
    } catch (error) {
      console.error("[AdvancedTabGroups] Error saving parent hierarchy:", error);
    }
  }

  saveGroupParent(groupId, parentId) {
    try {
      const parents = this.savedParents;
      if (parentId) {
        parents[groupId] = parentId;
      } else {
        delete parents[groupId];
      }
      this.savedParents = parents;
    } catch (error) {
      console.error("[AdvancedTabGroups] Error saving group parent:", error);
    }
  }

  removeSavedParent(groupId) {
    try {
      const parents = this.savedParents;
      delete parents[groupId];
      this.savedParents = parents;
    } catch (error) {
      console.error("[AdvancedTabGroups] Error removing saved group parent:", error);
    }
  }

  removeSavedParentTree(groupId) {
    try {
      const parents = this.savedParents;
      const removeIds = new Set([groupId]);
      let changed = true;
      while (changed) {
        changed = false;
        Object.entries(parents).forEach(([childId, parentId]) => {
          if (removeIds.has(parentId) && !removeIds.has(childId)) {
            removeIds.add(childId);
            changed = true;
          }
        });
      }
      removeIds.forEach(id => {
        delete parents[id];
      });
      this.savedParents = parents;
    } catch (error) {
      console.error("[AdvancedTabGroups] Error removing saved group parent tree:", error);
    }
  }

  removeSavedChildParentLinks(groupId) {
    try {
      const parents = this.savedParents;
      Object.entries(parents).forEach(([childId, parentId]) => {
        if (parentId === groupId) {
          delete parents[childId];
        }
      });
      this.savedParents = parents;
    } catch (error) {
      console.error("[AdvancedTabGroups] Error removing saved child parent links:", error);
    }
  }

  applySavedParents() {
    try {
      const parents = this.savedParents;
      const entries = Object.entries(parents).filter(([groupId, parentId]) => {
        return groupId && parentId && groupId !== parentId;
      });
      if (!entries.length) {
        return;
      }

      const depthFor = (groupId, seen = new Set()) => {
        const parentId = parents[groupId];
        if (!parentId || seen.has(groupId)) {
          return 0;
        }
        seen.add(groupId);
        return 1 + depthFor(parentId, seen);
      };

      entries.sort(([a], [b]) => depthFor(a) - depthFor(b));

      for (const [groupId, parentId] of entries) {
        const group = this.getGroupById(groupId);
        const parentGroup = this.getGroupById(parentId);
        if (
          group &&
          parentGroup &&
          !group.hasAttribute("split-view-group") &&
          !parentGroup.hasAttribute("split-view-group")
        ) {
          this.nestGroupUnder(group, parentGroup, { save: false });
        }
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error applying saved group hierarchy:", error);
    }
  }

  get savedIcons() {
    const icons = SessionStore.getCustomWindowValue(window, "tabGroupIcons");
    console.log("[AdvancedTabGroups] Retrieved icons from SessionStore:", icons);
    if (icons && icons !== "") {
      try {
        const parsed = JSON.parse(icons);
        console.log("[AdvancedTabGroups] Parsed icons:", parsed);
        return parsed;
      } catch (error) {
        console.error("[AdvancedTabGroups] Error parsing saved icons:", error);
        return {};
      }
    }
    return {};
  }

  set savedIcons(value) {
    try {
      console.log("[AdvancedTabGroups] Saving icons to SessionStore:", value);
      SessionStore.setCustomWindowValue(window, "tabGroupIcons", JSON.stringify(value));
    } catch (error) {
      console.error("[AdvancedTabGroups] Error saving icons to SessionStore:", error);
    }
  }

  // Save group icon to persistent storage
  saveGroupIcon(groupId, iconUrl) {
    const icons = this.savedIcons;
    icons[groupId] = iconUrl;
    this.savedIcons = icons;
  }

  async applyGroupIcon(group, iconUrl = null) {
    const iconContainer = await this.waitForElm(`tab-group[id="${group.id}"] .tab-group-icon-container`);
    let iconElement = iconContainer.querySelector(".tab-group-icon");
    if (!iconElement) {
      iconElement = document.createElement("div");
      iconElement.className = "tab-group-icon";
      iconContainer.appendChild(iconElement);
    }

    // Open the icon picker: Zen icons (searchable via fallback) + Tabler
    // (zia-extended-icons when installed, else ATG's bundled tab) + custom
    // upload. See openAtgIconPicker: no global open() wrapping, so this
    // cannot fight zia's wrapper in either load order.
    if (!iconUrl) {
      let picked = null;
      try {
        picked = await this.openAtgIconPicker(iconElement);
      } catch (error) {
        console.error("[AdvancedTabGroups] Error picking group icon:", error);
        picked = null;
      }
      if (!picked || (picked.value == null && !picked.explicit)) {
        // Dismissed (ESC/click-away): keep the existing icon.
        return;
      }
      iconUrl = typeof picked.value === "string" ? picked.value.trim() : picked.value;
      if (!iconUrl) {
        // Explicit "none" (trash button): clear the icon.
        this.removeGroupIcon(group);
        return;
      }
    }

    // One-time migration for SVGs stored before context normalization:
    // normalize now so they follow the same contrast rules, then the
    // normalized URL is what gets rendered and re-saved below.
    if (
      typeof iconUrl === "string" &&
      /^data:image\/svg/i.test(iconUrl) &&
      !this.hasContextPaint(iconUrl)
    ) {
      try {
        const normalized = this.normalizeUploadedSvg(iconUrl);
        if (normalized && normalized !== iconUrl) {
          iconUrl = normalized;
        }
      } catch (_) {}
    }

    if (typeof iconUrl === "string" && iconUrl.length > 220 * 1024) {
      console.warn("[AdvancedTabGroups] Icon too large, refusing to persist it.");
      return;
    }

    // Custom Tabler icons must wait for their resource:// host: handing
    // the URL to the group any earlier renders a broken icon.
    if (this.isAtgTablerIconUrl(iconUrl)) {
      await this.ensureAtgCustomIconsReady(iconUrl);
      if (this._atgTablerPackFailed) {
        console.warn("[AdvancedTabGroups] Tabler pack unavailable, skipping icon for group:", group?.id);
        return;
      }
    }

    this.persistGroupIcon(group, iconUrl);
  }

  // Apply saved icons to tab groups. The bundled Tabler pack is awaited
  // first so resource://atg-tabler/* icons are never handed to groups
  // before their host exists (each icon is gated again in applyGroupIcon).
  async applySavedIcons() {
    try {
      await this.ensureAtgCustomIconsReady();
      Object.entries(this.savedIcons).forEach(([groupId, iconUrl]) => {
        try {
          const group = this.getGroupById(groupId);
          if (group && (!group.hasAttribute || !group.hasAttribute("split-view-group"))) {
            this.applyGroupIcon(group, iconUrl);
          }
        } catch (error) {
          console.error("[AdvancedTabGroups] Error applying saved icon:", groupId, error);
        }
      });
    } catch (error) {
      console.error("[AdvancedTabGroups] Error applying saved icons:", error);
    }
  }

  // Remove saved icon for a specific tab group
  removeSavedIcon(groupId) {
    try {
      const icons = this.savedIcons;
      delete icons[groupId];
      this.savedIcons = icons;
    } catch (error) {
      console.error("[AdvancedTabGroups] Error removing saved icon:", error);
    }
  }

  // Collapsed state management
  get savedCollapsedStates() {
    const states = SessionStore.getCustomWindowValue(window, "tabGroupCollapsedStates");
    console.log("[AdvancedTabGroups] Retrieved collapsed states from SessionStore:", states);
    if (states && states !== "") {
      try {
        const parsed = JSON.parse(states);
        console.log("[AdvancedTabGroups] Parsed collapsed states:", parsed);
        return parsed;
      } catch (error) {
        console.error("[AdvancedTabGroups] Error parsing saved collapsed states:", error);
        return {};
      }
    }
    return {};
  }

  set savedCollapsedStates(value) {
    try {
      console.log("[AdvancedTabGroups] Saving collapsed states to SessionStore:", value);
      SessionStore.setCustomWindowValue(window, "tabGroupCollapsedStates", JSON.stringify(value));
    } catch (error) {
      console.error("[AdvancedTabGroups] Error saving collapsed states to SessionStore:", error);
    }
  }

  // Save group collapsed state to persistent storage
  saveGroupCollapsedState(groupId, isCollapsed) {
    try {
      const states = this.savedCollapsedStates;
      if (isCollapsed) {
        states[groupId] = true;
      } else {
        // Remove the entry if not collapsed (saves space)
        delete states[groupId];
      }
      this.savedCollapsedStates = states;
      console.log(`[AdvancedTabGroups] Saved collapsed state for group ${groupId}: ${isCollapsed}`);
    } catch (error) {
      console.error("[AdvancedTabGroups] Error saving collapsed state:", error);
    }
  }

  // Apply saved collapsed states to tab groups
  applySavedCollapsedStates() {
    try {
      if (this.isArcMode()) return;
      const states = this.savedCollapsedStates;
      Object.entries(states).forEach(([groupId, isCollapsed]) => {
        if (isCollapsed) {
          // Use waitForElm to handle groups that might not be ready yet
          this.waitForElm(`tab-group[id="${groupId}"]`).then(group => {
            if (group && !group.hasAttribute("split-view-group")) {
              if (this.isArcMode()) { group.removeAttribute("collapsed"); return; }
              group.setAttribute("collapsed", "true");
              console.log(`[AdvancedTabGroups] Applied collapsed state to group ${groupId}`);
            }
          }).catch(error => {
            console.warn(`[AdvancedTabGroups] Group ${groupId} not found for collapsed state restoration:`, error);
          });
        }
      });
    } catch (error) {
      console.error("[AdvancedTabGroups] Error applying saved collapsed states:", error);
    }
  }

  // Remove saved collapsed state for a specific tab group
  removeSavedCollapsedState(groupId) {
    try {
      const states = this.savedCollapsedStates;
      delete states[groupId];
      this.savedCollapsedStates = states;
      console.log(`[AdvancedTabGroups] Removed collapsed state for group ${groupId}`);
    } catch (error) {
      console.error("[AdvancedTabGroups] Error removing saved collapsed state:", error);
    }
  }

  // Public method to manually trigger color update for all groups
  updateAllGroupColors() {
    try {
      this.tabGroups.forEach((group) => {
        if (!group.hasAttribute || !group.hasAttribute("split-view-group")) {
          if (typeof group._useFaviconColor === "function" && group.color.endsWith("favicon")) {
            group._useFaviconColor();
          }
        }
      });
      console.log("[AdvancedTabGroups] Manual color update triggered for all groups");
    } catch (error) {
      console.error("[AdvancedTabGroups] Error updating all group colors:", error);
    }
  }

  // Public method to refresh group visibility (can be called externally)
  refreshGroupVisibility() {
    this.updateGroupVisibility();
  }
}

// Initialize when the page loads
(function () {
  if (!globalThis.advancedTabGroups) {
    function initATG() {
        globalThis.advancedTabGroups = new AdvancedTabGroups();
        
        // Add global debug functions for troubleshooting
        globalThis.debugAdvancedTabGroups = {
          updateColors: () => globalThis.advancedTabGroups.updateAllGroupColors(),
          refreshVisibility: () => globalThis.advancedTabGroups.refreshGroupVisibility(),
          processExisting: () => globalThis.advancedTabGroups.processExistingGroups(),
          applyCollapsedStates: () => globalThis.advancedTabGroups.applySavedCollapsedStates(),
          getGroups: () => {
            return globalThis.advancedTabGroups.tabGroups.map(g => ({
              id: g.id,
              label: g.label,
              parentId: globalThis.advancedTabGroups.getSavedParentId(g),
              collapsed: g.hasAttribute("collapsed"),
              hasContextMenu: !!g._contextMenuAdded,
              hasColorFunction: typeof g._useFaviconColor === "function"
            }));
          },
          getSavedStates: () => ({
            colors: globalThis.advancedTabGroups.savedColors,
            icons: globalThis.advancedTabGroups.savedIcons,
            parents: globalThis.advancedTabGroups.savedParents,
            collapsedStates: globalThis.advancedTabGroups.savedCollapsedStates
          })
        };
        
        console.log("[AdvancedTabGroups] Debug functions available at globalThis.debugAdvancedTabGroups");
    }
    
    if (document.readyState === "complete") {
        initATG();
    } else {
        window.addEventListener("load", initATG);
    }

    // Hide tab group menu items for folders and inactive workspace groups in tab context menu
    const tabContextMenu = document.getElementById("tabContextMenu");
    if (tabContextMenu) {
      tabContextMenu.addEventListener("popupshowing", () => {
        // Get folders to hide
        const foldersToHide = Array.from(
          gBrowser.tabContainer.querySelectorAll("zen-folder")
        ).map((f) => f.id);

        // Get groups not in active workspace to hide
        const activeWorkspaceGroups = gZenWorkspaces?.activeWorkspaceStrip?.querySelectorAll("tab-group") || [];
        const activeGroupIds = new Set(Array.from(activeWorkspaceGroups).map(g => g.id));
        
        // Use ATG's DOM-aware getter so nested groups are included.
        let inactiveGroupIds = globalThis.advancedTabGroups.tabGroups
          .filter(g => !activeGroupIds.has(g.id) && (!g.hasAttribute || !g.hasAttribute("split-view-group")))
          .map(g => g.id);

        // Combine folders and inactive groups to hide
        const itemsToHide = [...foldersToHide, ...inactiveGroupIds];

        // Finding menu items with tab group id
        const groupMenuItems = document.querySelectorAll(
          "#context_moveTabToGroupPopupMenu menuitem[tab-group-id]"
        );

        // Iterate over each item and hide ones present in itemsToHide array
        for (const menuItem of groupMenuItems) {
          const tabGroupId = menuItem.getAttribute("tab-group-id");

          if (itemsToHide.includes(tabGroupId)) {
            menuItem.hidden = true;
          } else {
            menuItem.hidden = false; // Show items that should be visible
          }
        }
      });
    }
    //  ^
    //  |
    // Thx to Bibek for this snippet! bibekbhusal on Discord.
  }
})();
