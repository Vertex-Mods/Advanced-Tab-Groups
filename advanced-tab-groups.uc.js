// ==UserScript==
// @name           Advanced Tab Groups
// @ignorecache
// ==/UserScript==
/* ==== Tab groups ==== */
/* https://github.com/Anoms12/Advanced-Tab-Groups */
/* ======= v3.6.0 ======= */

class AdvancedTabGroups {
  #initTabGroupListener;

  constructor() {
    this.init();
  }

  async init() {
    // Wait for any dependencies before proceeding.
    await this.waitForDependencies();

    // Load saved tab group settings
    this.applySavedColors();
    this.applySavedIcons();
    this.applySavedCollapsedStates();

    // Set up observer for all tab groups
    this.setupObserver();

    // Add folder context menu item
    this.addFolderContextMenuItems();

    // Make Zen Library render ATG tab groups differently from folders.
    this.setupZenLibraryIntegration();

    // Remove built-in tab group editor menus if they exist
    this.removeBuiltinTabGroupMenu();

    // Process existing groups
    this.processExistingGroups();

    // Also try again after a delay to catch any missed groups
    setTimeout(() => this.processExistingGroups(), 1000);

    // Apply saved collapsed states after groups are processed
    setTimeout(() => this.applySavedCollapsedStates(), 1500);

    // Listen for tab group creation events from the platform component
    document.addEventListener(
      "TabGroupCreate",
      this.onTabGroupCreate.bind(this)
    );

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

        const style = document.createElement("style");
        style.id = "advanced-tab-groups-zen-library-styles";
        style.textContent = `
          .library-workspace-tab-group {
            --atg-tab-group-color: var(--ws-primary-color);
            --atg-tab-group-stroke: light-dark(
              color-mix(in srgb, var(--zen-primary-color) 60%, black),
              color-mix(in srgb, var(--zen-colors-primary) 20%, var(--toolbox-textcolor))
            );
            flex-shrink: 0;
            width: 100%;
            margin-block: 4px 2px;
          }

          .library-workspace-tab-group.collapsed > .library-workspace-tab-group-content {
            max-height: 0;
            overflow: hidden;
          }

          .library-workspace-tab-group-content {
            margin-inline-start: 12px;
            max-height: 4000px;
            overflow: visible;
            position: relative;
            transition: max-height 0.15s var(--zen-library-easing);
          }

          .library-workspace-tab-group-content::after {
            content: "";
            position: absolute;
            left: -2px;
            top: 0;
            width: 2px;
            height: 100%;
            pointer-events: none;
            background: var(--atg-tab-group-color);
          }

          .library-workspace-tab-group[show-grain="true"] .library-workspace-tab-group-content::before {
            content: "";
            position: absolute;
            left: -2px;
            top: 0;
            width: 2px;
            height: 100%;
            pointer-events: none;
            background-image: url(chrome://browser/content/zen-images/grain-bg.png);
            opacity: var(--group-grain, 0);
            mix-blend-mode: overlay;
            z-index: 2;
          }

          .library-workspace-tab-group.collapsed .library-workspace-tab-group-content .library-workspace-item:not(.selected) {
            max-height: 0 !important;
            min-height: 0 !important;
            opacity: 0 !important;
            margin-block: 0 !important;
            pointer-events: none;
          }

          .library-workspace-item.atg-tab-group {
            min-height: 36px;
            height: 36px;
            margin: 0 !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            border-radius: var(--border-radius-medium, 6px) !important;
            gap: 8px;
            background: transparent;
          }

          .library-workspace-tab-group-content > .library-workspace-item {
            padding-left: var(--tab-inline-padding) !important;
          }

          .library-workspace-item.atg-tab-group:hover {
            background-color: var(--tab-hover-background-color, var(--ws-tab-hover-color)) !important;
          }

          .library-workspace-item.atg-tab-group.selected {
            background: transparent;
            box-shadow: none;
          }

          .library-workspace-item.atg-tab-group .item-label {
            color: var(--tab-selected-textcolor, var(--ws-text-color)) !important;
            direction: ltr;
            font-weight: 400 !important;
            height: 100%;
            display: flex;
            align-items: center;
            padding: 0 !important;
            mask-image: linear-gradient(to left, transparent, black 1em);
          }

          .atg-tab-group-chevron {
            width: 10px;
            height: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            opacity: 0.75;
          }

          .atg-tab-group-icon {
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px !important;
            position: relative;
            margin: 0 0 0 var(--tab-inline-padding);
            fill: var(--atg-tab-group-stroke) !important;
            background: var(--atg-tab-group-color);
            overflow: hidden;
          }

          .atg-tab-group-icon.has-custom-icon {
            color: var(--atg-tab-group-stroke);
          }

          .atg-tab-group-icon .group-icon {
            display: block;
            width: 12px;
            height: 12px;
            fill: white;
            -moz-context-properties: fill, fill-opacity;
          }

          .atg-tab-group-icon label {
            transform: translate(0, -1px);
            font-size: 11px;
            line-height: 16px;
          }

          .atg-tab-group-icon-fallback {
            width: 8px;
            height: 8px;
            border-radius: 2px;
            background: var(--atg-tab-group-stroke);
            opacity: 0.9;
          }

          @media (-moz-pref("browser.tabs.groups.arc-style")), (-moz-pref("tab.groups.fill-folders")), (-moz-pref("tab.groups.theme-folders")) {
            .library-workspace-item.atg-tab-group {
              min-height: 30px;
              height: 30px;
              margin-block-start: 5px !important;
              padding-left: var(--tab-inline-padding) !important;
              padding-right: 0 !important;
            }

            .library-workspace-item.atg-tab-group:hover {
              background-color: transparent !important;
            }

            .atg-tab-group-chevron {
              display: none !important;
            }

            .atg-tab-group-icon {
              display: none;
              background: none !important;
              margin: 0 !important;
            }

            .atg-tab-group-icon.has-custom-icon,
            .atg-tab-group-icon[zen-emoji-open="true"] {
              display: flex;
            }

            .atg-tab-group-icon .group-icon {
              width: 14px !important;
              height: 14px !important;
              fill: light-dark(black, white) !important;
            }

            .library-workspace-item.atg-tab-group .item-label {
              font-weight: 600 !important;
              padding-inline: 0 var(--space-medium, 8px) !important;
              margin-left: 0 !important;
            }

            .library-workspace-item.atg-tab-group:not(:has(.atg-tab-group-icon.has-custom-icon, .atg-tab-group-icon[zen-emoji-open="true"])) .item-label {
              margin-left: 10px !important;
            }

            .library-workspace-tab-group-content {
              margin-inline-start: 12px;
            }

            .library-workspace-tab-group-content::after,
            .library-workspace-tab-group[show-grain="true"] .library-workspace-tab-group-content::before {
              content: none !important;
            }

            .library-workspace-tab-group.collapsed .library-workspace-tab-group-content .library-workspace-item:not(.selected) {
              max-height: var(--tab-min-height) !important;
              min-height: var(--tab-min-height) !important;
              opacity: 1 !important;
              margin-block: 4px 2px !important;
              pointer-events: auto;
            }
          }
        `;
        root.appendChild(style);
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

      proto.renderAdvancedTabGroupsGroup = function (group, container, wsId) {
        this.ensureAdvancedTabGroupsStyles();

        const isArcLike =
          Services.prefs.getBoolPref("browser.tabs.groups.arc-style", false) ||
          Services.prefs.getBoolPref("tab.groups.fill-folders", false) ||
          Services.prefs.getBoolPref("tab.groups.theme-folders", false);
        const groupId = `advanced-tab-groups:${group.id || `${wsId}:${group.label}`}`;
        let isExpanded;
        if (isArcLike) {
          isExpanded = true;
          this._folderExpansion.set(groupId, true);
        } else if (this._folderExpansion.has(groupId)) {
          isExpanded = this._folderExpansion.get(groupId);
        } else {
          isExpanded = !group.hasAttribute("collapsed");
          this._folderExpansion.set(groupId, isExpanded);
        }

        const tabs = (group.tabs || []).filter(child => {
          return !child.hasAttribute("cloned") && !child.hasAttribute("zen-empty-tab");
        });
        const hasActive = tabs.some(tab => tab.selected);
        const groupColor = this.getAdvancedTabGroupsLibraryColor(group);
        const groupStroke = this.getAdvancedTabGroupsLibraryStroke(group);

        const groupEl = this.el("div", {
          className: `library-workspace-tab-group ${isExpanded ? "" : "collapsed"}`
        });
        if (groupColor) {
          groupEl.style.setProperty("--atg-tab-group-color", groupColor);
        }
        if (groupStroke && !groupStroke.includes("gradient")) {
          groupEl.style.setProperty("--atg-tab-group-stroke", groupStroke);
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

            const newlyExpanded = !this._folderExpansion.get(groupId);
            this._folderExpansion.set(groupId, newlyExpanded);
            groupEl.classList.toggle("collapsed", !newlyExpanded);

            const chevron = headerEl.querySelector(".atg-tab-group-chevron svg");
            if (chevron) {
              const rot = newlyExpanded ? "0deg" : "-90deg";
              chevron.setAttribute(
                "style",
                `transform: rotate(${rot}); transition: transform 0.2s;`
              );
            }
          }
        });

        headerEl.appendChild(this.createAdvancedTabGroupsIconNode(group));

        headerEl.appendChild(
          this.el("span", {
            className: "item-label",
            textContent: group.label || "Tab Group"
          })
        );
        groupEl.appendChild(headerEl);

        const contentEl = this.el("div", {
          className: "library-workspace-tab-group-content"
        });
        tabs.forEach(tab => this.renderTab(tab, contentEl, wsId));

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

  // Update visibility of tab groups based on active workspace
  updateGroupVisibility() {
    try {
      // Get all tab groups in the active workspace using DOM query (for active workspace detection)
      const activeWorkspaceGroups = gZenWorkspaces?.activeWorkspaceStrip?.querySelectorAll("tab-group") || [];
      const activeGroupIds = new Set(Array.from(activeWorkspaceGroups).map(g => g.id));

      this.tabGroups.forEach(group => {
        // Skip split-view-groups
        if (group.hasAttribute && group.hasAttribute("split-view-group")) {
          return;
        }
      
        // Add or remove hidden attribute based on workspace membership
        if (activeGroupIds.has(group.id)) {
          // Group is in active workspace - remove hidden attribute
          group.removeAttribute("hidden");
        } else {
          // Group is not in active workspace - add hidden attribute
          group.setAttribute("hidden", "true");
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

  get tabGroups() {
    return gBrowser.tabGroups.filter(group => group.tagName === "tab-group");
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
      <image class="tab-group-folder-button" role="button" keyNav="false" tooltiptext="Create folder"/>
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

      try {
        // Remove the group's saved color, icon, and collapsed state before removing the group
        this.removeSavedColor(group.id);
        this.removeSavedIcon(group.id);
        this.removeSavedCollapsedState(group.id);

        gBrowser.removeTabGroup(group);
      } catch (error) {
        console.error("[AdvancedTabGroups] Error removing tab group:", error);
      }
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
      if (!currentColor && !savedColor && typeof group._useFaviconColor === "function") {
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
          <menuseparator/>
          <menu class="move-group-to-space" label="Move to Space">
            <menupopup class="move-group-to-space-popup"/>
          </menu>
          <menuseparator/>
          <menuitem class="ungroup-tabs" label="Ungroup"/>
          <menuitem class="convert-group-to-folder" 
                    label="Convert to Folder"/>
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

      const menuItems = [
        [setGroupColorItem, "_setGroupColor"],
        [useFaviconColorItem, "_useFaviconColor"],
        [renameGroupItem, this.renameGroupStart],
        [changeGroupIconItem, this.applyGroupIcon],
        [ungroupTabsItem, this.ungroupTabs],
        [convertToFolderItem, this.convertGroupToFolder]
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
    // If the background is dark mode, we need to get the contrast of that (opposite).
    const shouldBeDarkMode = !gZenThemePicker.shouldBeDarkMode(
      typeof colors[0] === "object" ? gZenThemePicker.getMostDominantColor(colors) : colors
    );
    if (groupIcon) {
      if (shouldBeDarkMode) {
        groupIcon.style.fill = "black";
      } else {
        groupIcon.style.fill = "white";
      }
    }
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
          self.syncGroupColorVars(group);
        
          this.updateIconColor(group, finalColor);
          this.saveTabGroupColors();

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
      this.removeSavedCollapsedState(group.id);
    } catch (error) {
      console.error("[AdvancedTabGroups] Error ungrouping tabs:", error);
    }
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

  // Save tab group colors to persistent storage
  saveTabGroupColors() {
    try {
      // This method is called from _useFaviconColor, but the main color saving
      // is handled in the color picker's handlePanelClose function.
      // We don't need to override the complex color objects with simple strings.
      console.log("[AdvancedTabGroups] Color saving handled by color picker");
    } catch (error) {
      console.error("[AdvancedTabGroups] Error in saveTabGroupColors:", error);
    }
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
    if (!group?.id || group.hasAttribute("split-view-group")) {
      return;
    }

    const color = this.getGroupColorValue(group);
    const stroke = this.getGroupStrokeValue(group);
    const colorTargets = [
      group,
      group.querySelector(".tab-group-label-container"),
      group.querySelector(".tab-group-icon-container"),
      group.querySelector(".tab-group-icon"),
      group.querySelector(".tab-group-container"),
    ].filter(Boolean);

    if (color) {
      colorTargets.forEach(target => target.style.setProperty("--tab-group-color", color));
    }

    if (stroke && !stroke.includes("gradient")) {
      colorTargets.forEach(target => target.style.setProperty("--tab-group-stroke", stroke));
    }
  }

  // Apply saved colors to tab groups
  applySavedColors() {
    try {
      Object.entries(this.savedColors).forEach(async ([groupId, color]) => {
        const syncSavedGroup = async () => {
          const group = await this.waitForElm(`tab-group[id="${groupId}"]`);
          if (group) {
            this.syncGroupColorVars(group);
          }
        };

        // Handle new format (object with gradientColors, opacity, texture)
        if (typeof color === 'object' && color.gradientColors) {
          const previousOpacity = gZenThemePicker.currentOpacity;
          gZenThemePicker.currentOpacity = color.opacity || 1;

          const gradient = gZenThemePicker.getGradient(color.gradientColors);
          document.documentElement.style.setProperty(`--tab-group-color-${groupId}`, gradient);
          document.documentElement.style.setProperty(`--tab-group-color-${groupId}-invert`, gradient);

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
        // Handle old format (simple color string) for backward compatibility
        else if (typeof color === 'string' && color.trim() !== '') {
          document.documentElement.style.setProperty(`--tab-group-color-${groupId}`, color);
          document.documentElement.style.setProperty(`--tab-group-color-${groupId}-invert`, color);
          syncSavedGroup();
        }
      });
    } catch (error) {
      console.error("[AdvancedTabGroups] Error applying saved colors:", error);
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

    // Open the emoji picker with SVG icons only
    if (!iconUrl) {
      iconUrl = await window.gZenEmojiPicker.open(iconElement, {
        onlySvgIcons: !Services.prefs.getBoolPref("browser.tabs.groups.allow-emojis", false)
      });
    }
  
    iconElement.querySelector("image")?.remove();
    iconElement.querySelector("label")?.remove();

    if (iconUrl) {
      // Create an image element for the SVG icon using parsed XUL
      let imgFrag;
      if (iconUrl.endsWith(".svg")) {
        imgFrag = window.MozXULElement.parseXULToFragment(`
          <image src="${iconUrl}" class="group-icon" alt="Group Icon"/>
        `);
      } else {
        imgFrag = window.MozXULElement.parseXULToFragment(`
          <label>${iconUrl}</label>
        `);
      }
      iconElement.appendChild(imgFrag.firstElementChild);

      this.updateIconColor(group, this.savedColors[group.id]?.gradientColors || [])
      this.syncGroupColorVars(group);
    
      // Save the icon to persistent storage
      this.saveGroupIcon(group.id, iconUrl);
    } else {
      // Remove the icon from persistent storage
      this.removeSavedIcon(group.id);
    }
  }

  // Apply saved icons to tab groups
  applySavedIcons() {
    try {
      Object.entries(this.savedIcons).forEach(([groupId, iconUrl]) => {
        const group = this.getGroupById(groupId);
        if (group && (!group.hasAttribute || !group.hasAttribute("split-view-group"))) {
          this.applyGroupIcon(group, iconUrl);
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
              collapsed: g.hasAttribute("collapsed"),
              hasContextMenu: !!g._contextMenuAdded,
              hasColorFunction: typeof g._useFaviconColor === "function"
            }));
          },
          getSavedStates: () => ({
            colors: globalThis.advancedTabGroups.savedColors,
            icons: globalThis.advancedTabGroups.savedIcons,
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
        
        // Use gBrowser.tabGroups to find inactive groups (more efficient)
        let inactiveGroupIds = gBrowser.tabGroups
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
