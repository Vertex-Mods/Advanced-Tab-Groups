// ==UserScript==
// @name           Advanced Tab Groups
// @ignorecache
// ==/UserScript==
/* ==== Tab groups ==== */
/* https://github.com/Anoms12/Advanced-Tab-Groups */
/* ====== v3.3.0s ====== */

window.UC_API = ChromeUtils.importESModule("chrome://userchromejs/content/uc_api.sys.mjs");

class AdvancedTabGroups {
  constructor() {
    this.init();
  }

  init() {
    // Load saved tab group colors
    this.loadSavedColors();

    // Load saved tab group icons
    this.loadGroupIcons();

    // Set up observer for all tab groups
    this.setupObserver();

    // Add folder context menu item
    this.addFolderContextMenuItems();

    // Remove built-in tab group editor menus if they exist
    this.removeBuiltinTabGroupMenu();

    // Process existing groups
    this.processExistingGroups();

    // Also try again after a delay to catch any missed groups
    setTimeout(() => this.processExistingGroups(), 1000);

    // Set up periodic saving of colors (every 30 seconds)
    setInterval(() => {
      this.saveTabGroupColors();
    }, 30000);

    // Listen for tab group creation events from the platform component
    document.addEventListener(
      "TabGroupCreate",
      this.onTabGroupCreate.bind(this)
    );

    // Set up workspace change observer to update group visibility
    this.setupWorkspaceObserver();

    // Set up observer for tabs section to update separator visibility
    this.setupSeparatorObserver();

    // Initial update of group visibility
    setTimeout(() => this.updateGroupVisibility(), 500);
  }

  // Set up observer for the normal tabs section to update separator visibility
  setupSeparatorObserver() {
    // Wait for the workspace to be ready
    setTimeout(() => {
      if (!window.gZenWorkspaces || !gZenWorkspaces.activeWorkspaceStrip) {
        // Try again if not ready
        setTimeout(() => this.setupSeparatorObserver(), 500);
        return;
      }

      const workspaceStrip = gZenWorkspaces.activeWorkspaceStrip;
      const normalTabsSection = workspaceStrip.tabsContainer;

      if (!normalTabsSection) {
        return;
      }

      // Create observer to watch for changes in the normal tabs section
      const separatorObserver = new MutationObserver(() => {
        // Update separator visibility when tabs/groups are added or removed
        this.updatePinnedSeparatorVisibility();
      });

      // Observe changes to the normal tabs section
      separatorObserver.observe(normalTabsSection, {
        childList: true,
        subtree: false // Only watch direct children
      });

      console.log("[AdvancedTabGroups] Separator observer set up");
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

  // Set up observer for workspace changes to update group visibility
  setupWorkspaceObserver() {
    // Listen for workspace changes
    if (window.gZenWorkspaces) {
      // Override the original workspace switching method to add our visibility update
      const originalSwitchToWorkspace = window.gZenWorkspaces.switchToWorkspace;
      if (originalSwitchToWorkspace) {
        window.gZenWorkspaces.switchToWorkspace = (...args) => {
          const result = originalSwitchToWorkspace.apply(window.gZenWorkspaces, args);
          // Update group visibility after workspace switch
          setTimeout(() => this.updateGroupVisibility(), 100);
          return result;
        };
      }

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
  }

  // Update visibility of tab groups based on active workspace
  updateGroupVisibility() {
    try {
      // Get all tab groups in the active workspace using DOM query (for active workspace detection)
      const activeWorkspaceGroups = gZenWorkspaces?.activeWorkspaceStrip?.querySelectorAll("tab-group") || [];
      const activeGroupIds = new Set(Array.from(activeWorkspaceGroups).map(g => g.id));

      // Use gBrowser.tabGroups to iterate through all groups (more efficient)
      if (gBrowser.tabGroups) {
        gBrowser.tabGroups.forEach(group => {
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

        console.log(`[AdvancedTabGroups] Updated visibility for ${gBrowser.tabGroups.length} groups, ${activeGroupIds.size} active`);
      } else {
        // Fallback to DOM query if gBrowser.tabGroups is not available
        const allGroups = document.querySelectorAll("tab-group");
        
        allGroups.forEach(group => {
          // Skip split-view-groups
          if (group.hasAttribute("split-view-group")) {
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

        console.log(`[AdvancedTabGroups] Updated visibility for ${allGroups.length} groups (fallback), ${activeGroupIds.size} active`);
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error updating group visibility:", error);
    }
  }

  // Update pinned tabs separator visibility based on whether there are unpinned tabs/groups
  updatePinnedSeparatorVisibility() {
    try {
      if (!window.gZenWorkspaces || !gZenWorkspaces.activeWorkspaceStrip) {
        console.log("[AdvancedTabGroups] Workspace not ready");
        return;
      }

      const workspaceStrip = gZenWorkspaces.activeWorkspaceStrip;
      const pinnedTabsSection = workspaceStrip.pinnedTabsContainer;
      const normalTabsSection = workspaceStrip.tabsContainer;

      if (!pinnedTabsSection || !normalTabsSection) {
        console.log("[AdvancedTabGroups] Tabs sections not found");
        return;
      }

      // Count actual visible tabs and groups in the normal tabs section
      // Exclude: periphery element, hidden elements, and empty tabs
      let hasContent = false;
      let contentCount = 0;
      
      for (const child of normalTabsSection.children) {
        const tagName = child.tagName?.toLowerCase();
        const childInfo = `${tagName} id=${child.id} hidden=${child.hidden || child.hasAttribute("hidden")}`;
        
        // Skip the periphery element
        if (child.id === "tabbrowser-arrowscrollbox-periphery") {
          console.log(`[AdvancedTabGroups] Skipping periphery: ${childInfo}`);
          continue;
        }
        // Skip hidden elements
        if (child.hidden || child.hasAttribute("hidden")) {
          console.log(`[AdvancedTabGroups] Skipping hidden: ${childInfo}`);
          continue;
        }
        // Skip empty tabs
        if (child.hasAttribute("zen-empty-tab")) {
          console.log(`[AdvancedTabGroups] Skipping empty tab: ${childInfo}`);
          continue;
        }
        // If we find any visible tab or group, we have content
        if (tagName === "tab" || tagName === "tab-group") {
          console.log(`[AdvancedTabGroups] Found content: ${childInfo}`);
          hasContent = true;
          contentCount++;
        }
      }

      // Update the hide-separator attribute based on whether there's content
      if (hasContent) {
        pinnedTabsSection.removeAttribute("hide-separator");
      } else {
        pinnedTabsSection.setAttribute("hide-separator", "true");
      }

      console.log(`[AdvancedTabGroups] Separator visibility: ${hasContent ? "visible" : "hidden"} (${contentCount} items)`);
    } catch (error) {
      console.error("[AdvancedTabGroups] Error updating separator visibility:", error);
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

  processExistingGroups() {
    // Use gBrowser.tabGroups if available (more efficient)
    if (gBrowser.tabGroups) {
      console.log(`[AdvancedTabGroups] Processing ${gBrowser.tabGroups.length} existing groups via gBrowser.tabGroups`);
      
      gBrowser.tabGroups.forEach((group) => {
        // Skip split-view-groups
        if (!group.hasAttribute || !group.hasAttribute("split-view-group")) {
          this.processGroup(group);
        }
      });
    } else {
      // Fallback to DOM query
      const groups = document.querySelectorAll("tab-group");
      console.log(`[AdvancedTabGroups] Processing ${groups.length} existing groups via DOM query (fallback)`);

      groups.forEach((group) => {
        // Skip split-view-groups
        if (!group.hasAttribute("split-view-group")) {
          this.processGroup(group);
        }
      });
    }
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
    if (selectAll) {
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

    // Create and inject the icon container and close button
    const groupDomFrag = window.MozXULElement.parseXULToFragment(`
      <div class="tab-group-icon-container">
        <div class="tab-group-icon"></div>
        <image class="group-marker" role="button" keyNav="false" tooltiptext="Toggle Group"/>
      </div>
      <image class="tab-close-button close-icon" role="button" keyNav="false" tooltiptext="Close Group"/>
    `);
    const iconContainer = groupDomFrag.children[0];
    const closeButton = groupDomFrag.children[1];

    // Insert the icon container at the beginning of the label container
    labelContainer.insertBefore(iconContainer, labelContainer.firstChild);
    // Add the close button to the label container
    labelContainer.appendChild(closeButton);

    // Mark as processed to prevent duplicate processing
    group.setAttribute("data-close-button-added", "true");

    // Add click event listener
    closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      

      try {
        // Remove the group's saved color and icon before removing the group
        this.removeSavedColor(group.id);
        this.removeSavedIcon(group.id);

        gBrowser.removeTabGroup(group);
        
      } catch (error) {
        console.error("[AdvancedTabGroups] Error removing tab group:", error);
      }
    });

    // Remove editor mode class if present (prevent editor mode on new group)
    group.classList.remove("tab-group-editor-mode-create");

    // If the group is new (no label or default label), start renaming and set color
    if (
      !group.label ||
      group.label === "" ||
      ("defaultGroupName" in group && group.label === group.defaultGroupName)
    ) {
      // Start renaming
      this.renameGroupStart(group, false); // Don't select all for new groups
      // Set color to average favicon color
      if (typeof group._useFaviconColor === "function") {
        group._useFaviconColor();
      }
    } else {
      // For existing groups, also apply favicon color if no color is set
      const currentColor = group.style.getPropertyValue("--tab-group-color");
      if (!currentColor && typeof group._useFaviconColor === "function") {
        group._useFaviconColor();
      }
    }

    // Set up observer to automatically update color when tabs change
    this.setupGroupColorObserver(group);

    // Add context menu to the group
    this.addContextMenu(group);

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
        if (typeof group._useFaviconColor === "function") {
          group._useFaviconColor();
        }
      }, 500);
    });

    observer.observe(group, {
      childList: true,
      subtree: true
    });
  }

  // Ensure a single, shared context menu exists and is wired up
  ensureSharedContextMenu() {
    if (this._sharedContextMenu) return this._sharedContextMenu;

    try {
      const contextMenuFrag = window.MozXULElement.parseXULToFragment(`
        <menupopup id="advanced-tab-groups-context-menu">
          <menuitem class="rename-group" label="Rename"/>
          <menuitem class="change-group-icon" label="Change Icon"/>
          <menuseparator/>
          <menuitem class="ungroup-tabs" label="Ungroup Tabs"/>
          <menuitem class="convert-group-to-folder" 
                    label="Convert Group to Folder"/>
        </menupopup>
      `);

      const contextMenu = contextMenuFrag.firstElementChild;
      document.body.appendChild(contextMenu);

      // Track which group is targeted while the popup is open
      this._contextMenuCurrentGroup = null;

      const renameGroupItem = contextMenu.querySelector(".rename-group");
      const changeGroupIconItem = contextMenu.querySelector(".change-group-icon");
      const ungroupTabsItem = contextMenu.querySelector(".ungroup-tabs");
      const convertToFolderItem = contextMenu.querySelector(
        ".convert-group-to-folder"
      );

      if (renameGroupItem) {
        renameGroupItem.addEventListener("command", () => {
          const group = this._contextMenuCurrentGroup;
          if (group) {
            console.log("[AdvancedTabGroups] Rename group command triggered for:", group.id);
            this.renameGroupStart(group);
          }
        });
      }

      if (changeGroupIconItem) {
        changeGroupIconItem.addEventListener("command", () => {
          const group = this._contextMenuCurrentGroup;
          if (group) {
            console.log("[AdvancedTabGroups] Change icon command triggered for:", group.id);
            this.changeGroupIcon(group);
          }
        });
      }

      if (ungroupTabsItem) {
        ungroupTabsItem.addEventListener("command", () => {
          const group = this._contextMenuCurrentGroup;
          if (group && typeof group.ungroupTabs === "function") {
            try {
              console.log("[AdvancedTabGroups] Ungroup tabs command triggered for:", group.id);
              group.ungroupTabs();
            } catch (error) {
              console.error("[AdvancedTabGroups] Error ungrouping tabs:", error);
            }
          }
        });
      }

      if (convertToFolderItem) {
        convertToFolderItem.addEventListener("command", () => {
          const group = this._contextMenuCurrentGroup;
          if (group) {
            console.log("[AdvancedTabGroups] Convert to folder command triggered for:", group.id);
            this.convertGroupToFolder(group);
          }
        });
      }

      // Clear the current group when the menu closes (ready to be reused)
      contextMenu.addEventListener("popuphidden", () => {
        console.log("[AdvancedTabGroups] Context menu hidden");
        this._contextMenuCurrentGroup = null;
      });

      this._sharedContextMenu = contextMenu;
      console.log("[AdvancedTabGroups] Shared context menu created successfully");
      return this._sharedContextMenu;
    } catch (error) {
      console.error("[AdvancedTabGroups] Error creating shared context menu:", error);
      return null;
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
        // Remove the group's saved color and icon before removing the group
        this.removeSavedColor(group.id);
        this.removeSavedIcon(group.id);

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


    group._changeGroupIcon = () => {
      this.changeGroupIcon(group);
    };

    group._useFaviconColor = () => {
      // Capture 'this' for use in callbacks
      const self = this;

      try {
        // Get all favicon images directly from the group
        const favicons = group.querySelectorAll(".tab-icon-image");
        if (favicons.length === 0) {
          return;
        }

        // Extract colors from favicons
        const colors = [];
        let processedCount = 0;
        const totalFavicons = favicons.length;

        favicons.forEach((favicon, index) => {
          if (favicon && favicon.src && favicon.src !== "chrome://global/skin/icons/defaultFavicon.svg") {
            // Create a canvas to analyze the favicon
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const img = new Image();

            // Set crossOrigin to handle CORS issues
            img.crossOrigin = "anonymous";

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

                processedCount++;

                // If this is the last favicon processed, calculate average and apply
                if (processedCount === totalFavicons) {
                  if (colors.length > 0) {
                    const finalColor = self._calculateAverageColor(colors);
                    const colorString = `rgb(${finalColor[0]}, ${finalColor[1]}, ${finalColor[2]})`;

                    // Set the --tab-group-color CSS variable
                    group.style.setProperty("--tab-group-color", colorString);
                    group.style.setProperty(
                      "--tab-group-color-invert",
                      colorString
                    );

                    // Save the color to persistent storage
                    self.saveTabGroupColors();
                  }
                }
              } catch (error) {
                console.error(
                  "[AdvancedTabGroups] Error processing favicon",
                  index + 1,
                  ":",
                  error
                );
                processedCount++;

                // Still check if we're done processing
                if (processedCount === totalFavicons && colors.length > 0) {
                  const finalColor = self._calculateAverageColor(colors);
                  const colorString = `rgb(${finalColor[0]}, ${finalColor[1]}, ${finalColor[2]})`;

                  group.style.setProperty("--tab-group-color", colorString);
                  group.style.setProperty(
                    "--tab-group-color-invert",
                    colorString
                  );

                  self.saveTabGroupColors();
                }
              }
            };

            img.onerror = () => {
              console.warn("[AdvancedTabGroups] Failed to load favicon:", favicon.src);
              processedCount++;

              // Check if we're done processing
              if (processedCount === totalFavicons && colors.length > 0) {
                const finalColor = self._calculateAverageColor(colors);
                const colorString = `rgb(${finalColor[0]}, ${finalColor[1]}, ${finalColor[2]})`;

                group.style.setProperty("--tab-group-color", colorString);
                group.style.setProperty(
                  "--tab-group-color-invert",
                  colorString
                );

                self.saveTabGroupColors();
              }
            };

            // Add timeout to prevent hanging
            setTimeout(() => {
              if (img.complete === false) {
                console.warn("[AdvancedTabGroups] Favicon load timeout:", favicon.src);
                processedCount++;
                
                if (processedCount === totalFavicons && colors.length > 0) {
                  const finalColor = self._calculateAverageColor(colors);
                  const colorString = `rgb(${finalColor[0]}, ${finalColor[1]}, ${finalColor[2]})`;

                  group.style.setProperty("--tab-group-color", colorString);
                  group.style.setProperty("--tab-group-color-invert", colorString);

                  self.saveTabGroupColors();
                }
              }
            }, 3000);

            img.src = favicon.src;
          } else {
            processedCount++;

            // Check if we're done processing
            if (processedCount === totalFavicons && colors.length > 0) {
              const finalColor = self._calculateAverageColor(colors);
              const colorString = `rgb(${finalColor[0]}, ${finalColor[1]}, ${finalColor[2]})`;

              group.style.setProperty("--tab-group-color", colorString);
              group.style.setProperty("--tab-group-color-invert", colorString);

              self.saveTabGroupColors();
            }
          }
        });
      } catch (error) {
        console.error(
          "[AdvancedTabGroups] Error extracting favicon colors:",
          error
        );
      }
    };
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

        // Remove the saved color and icon for the original group
        this.removeSavedColor(group.id);
        this.removeSavedIcon(group.id);

        
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

  // Change group icon using the Zen emoji picker (SVG icons only)
  async changeGroupIcon(group) {
    try {
      // Check if the Zen emoji picker is available
      if (!window.gZenEmojiPicker) {
        console.error("[AdvancedTabGroups] Zen emoji picker not available");
        return;
      }

      // Find the icon container in the group
      const iconContainer = group.querySelector(".tab-group-icon-container");
      if (!iconContainer) {
        console.error(
          "[AdvancedTabGroups] Icon container not found for group:",
          group.id
        );
        return;
      }

      // Find the icon element (create if it doesn't exist)
      let iconElement = iconContainer.querySelector(".tab-group-icon");
      if (!iconElement) {
        iconElement = document.createElement("div");
        iconElement.className = "tab-group-icon";
        iconContainer.appendChild(iconElement);
      }

      // Open the emoji picker with SVG icons only
      const selectedIcon = await window.gZenEmojiPicker.open(iconElement, {
        onlySvgIcons: true,
      });

      if (selectedIcon) {
        // Clear any existing icon content
        iconElement.innerHTML = "";

        // Create an image element for the SVG icon using parsed XUL
        const imgFrag = window.MozXULElement.parseXULToFragment(`
          <image src="${selectedIcon}" class="group-icon" alt="Group Icon"/>
        `);
        iconElement.appendChild(imgFrag.firstElementChild);

        // Save the icon to persistent storage
        this.saveGroupIcon(group.id, selectedIcon);
      } else if (selectedIcon === null) {
        // Clear the icon content
        iconElement.innerHTML = "";

        // Remove the icon from persistent storage
        this.removeSavedIcon(group.id);
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error changing group icon:", error);
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
  async saveTabGroupColors() {
    try {
      if (typeof UC_API !== "undefined" && UC_API.FileSystem) {
        const colors = {};

        // Use gBrowser.tabGroups if available (more efficient)
        if (gBrowser.tabGroups) {
          gBrowser.tabGroups.forEach((group) => {
            if (group.id && (!group.hasAttribute || !group.hasAttribute("split-view-group"))) {
              const color = group.style.getPropertyValue("--tab-group-color");
              if (color && color !== "") {
                colors[group.id] = color;
              }
            }
          });
        } else {
          // Fallback to DOM query
          const groups = document.querySelectorAll("tab-group");
          groups.forEach((group) => {
            if (group.id && !group.hasAttribute("split-view-group")) {
              const color = group.style.getPropertyValue("--tab-group-color");
              if (color && color !== "") {
                colors[group.id] = color;
              }
            }
          });
        }

        // Save to file
        const jsonData = JSON.stringify(colors, null, 2);
        await UC_API.FileSystem.writeFile("tab_group_colors.json", jsonData);
      } else {
        console.warn(
          "[AdvancedTabGroups] UC_API.FileSystem not available, using localStorage fallback"
        );
        // Fallback to localStorage if UC_API is not available
        const colors = {};
        
        if (gBrowser.tabGroups) {
          gBrowser.tabGroups.forEach((group) => {
            if (group.id && (!group.hasAttribute || !group.hasAttribute("split-view-group"))) {
              const color = group.style.getPropertyValue("--tab-group-color");
              if (color && color !== "") {
                colors[group.id] = color;
              }
            }
          });
        } else {
          const groups = document.querySelectorAll("tab-group");
          groups.forEach((group) => {
            if (group.id && !group.hasAttribute("split-view-group")) {
              const color = group.style.getPropertyValue("--tab-group-color");
              if (color && color !== "") {
                colors[group.id] = color;
              }
            }
          });
        }
        
        localStorage.setItem(
          "advancedTabGroups_colors",
          JSON.stringify(colors)
        );
      }
    } catch (error) {
      console.error(
        "[AdvancedTabGroups] Error saving tab group colors:",
        error
      );
    }
  }

  // Load saved tab group colors from persistent storage
  async loadSavedColors() {
    try {
      let colors = {};

      if (typeof UC_API !== "undefined" && UC_API.FileSystem) {
        try {
          // Try to read from file
          const fsResult = await UC_API.FileSystem.readFile(
            "tab_group_colors.json"
          );
          if (fsResult.isContent()) {
            colors = JSON.parse(fsResult.content());
          }
        } catch (fileError) {
          // No saved color file found
        }
      } else {
        // Fallback to localStorage
        const savedColors = localStorage.getItem("advancedTabGroups_colors");
        if (savedColors) {
          colors = JSON.parse(savedColors);
        }
      }

      // Apply colors to existing groups
      if (Object.keys(colors).length > 0) {
        setTimeout(() => {
          this.applySavedColors(colors);
        }, 500); // Small delay to ensure groups are fully loaded
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error loading saved colors:", error);
    }
  }

  // Apply saved colors to tab groups
  applySavedColors(colors) {
    try {
      Object.entries(colors).forEach(([groupId, color]) => {
        // Try to find the group using gBrowser.tabGroups first
        let group = null;
        
        if (gBrowser.tabGroups) {
          group = Array.from(gBrowser.tabGroups).find(g => g.id === groupId);
        }
        
        // Fallback to DOM query if not found or gBrowser.tabGroups not available
        if (!group) {
          group = document.getElementById(groupId);
        }
        
        if (group && (!group.hasAttribute || !group.hasAttribute("split-view-group"))) {
          group.style.setProperty("--tab-group-color", color);
          group.style.setProperty("--tab-group-color-invert", color);
        }
      });
    } catch (error) {
      console.error("[AdvancedTabGroups] Error applying saved colors:", error);
    }
  }

  // Remove saved color for a specific tab group
  async removeSavedColor(groupId) {
    try {
      if (typeof UC_API !== "undefined" && UC_API.FileSystem) {
        try {
          // Read current colors
          const fsResult = await UC_API.FileSystem.readFile(
            "tab_group_colors.json"
          );
          if (fsResult.isContent()) {
            const colors = JSON.parse(fsResult.content());
            delete colors[groupId];

            // Save updated colors
            const jsonData = JSON.stringify(colors, null, 2);
            await UC_API.FileSystem.writeFile(
              "tab_group_colors.json",
              jsonData
            );
          }
        } catch (fileError) {
          // No saved color file found
        }
      } else {
        // Fallback to localStorage
        const savedColors = localStorage.getItem("advancedTabGroups_colors");
        if (savedColors) {
          const colors = JSON.parse(savedColors);
          delete colors[groupId];
          localStorage.setItem(
            "advancedTabGroups_colors",
            JSON.stringify(colors)
          );
        }
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error removing saved color:", error);
    }
  }

  // Save group icon to persistent storage
  async saveGroupIcon(groupId, iconUrl) {
    try {
      if (typeof UC_API !== "undefined" && UC_API.FileSystem) {
        // Read current icons
        let icons = {};
        try {
          const fsResult = await UC_API.FileSystem.readFile(
            "tab_group_icons.json"
          );
          if (fsResult.isContent()) {
            icons = JSON.parse(fsResult.content());
          }
        } catch (fileError) {
          // No saved icon file found
        }

        // Update with new icon
        icons[groupId] = iconUrl;

        // Save to file
        const jsonData = JSON.stringify(icons, null, 2);
        await UC_API.FileSystem.writeFile("tab_group_icons.json", jsonData);
      } else {
        // Fallback to localStorage
        const savedIcons = localStorage.getItem("advancedTabGroups_icons");
        let icons = savedIcons ? JSON.parse(savedIcons) : {};
        icons[groupId] = iconUrl;
        localStorage.setItem("advancedTabGroups_icons", JSON.stringify(icons));
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error saving group icon:", error);
    }
  }

  // Load saved group icons from persistent storage
  async loadGroupIcons() {
    try {
      let icons = {};

      if (typeof UC_API !== "undefined" && UC_API.FileSystem) {
        try {
          const fsResult = await UC_API.FileSystem.readFile(
            "tab_group_icons.json"
          );
          if (fsResult.isContent()) {
            icons = JSON.parse(fsResult.content());
          }
        } catch (fileError) {
          // No saved icon file found
        }
      } else {
        // Fallback to localStorage
        const savedIcons = localStorage.getItem("advancedTabGroups_icons");
        if (savedIcons) {
          icons = JSON.parse(savedIcons);
        }
      }

      // Apply icons to existing groups
      if (Object.keys(icons).length > 0) {
        setTimeout(() => {
          this.applySavedIcons(icons);
        }, 500); // Small delay to ensure groups are fully loaded
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error loading saved icons:", error);
    }
  }

  // Apply saved icons to tab groups
  applySavedIcons(icons) {
    try {
      Object.entries(icons).forEach(([groupId, iconUrl]) => {
        // Try to find the group using gBrowser.tabGroups first
        let group = null;
        
        if (gBrowser.tabGroups) {
          group = Array.from(gBrowser.tabGroups).find(g => g.id === groupId);
        }
        
        // Fallback to DOM query if not found or gBrowser.tabGroups not available
        if (!group) {
          group = document.getElementById(groupId);
        }
        
        if (group && (!group.hasAttribute || !group.hasAttribute("split-view-group"))) {
          const iconContainer = group.querySelector(
            ".tab-group-icon-container"
          );
          if (iconContainer) {
            let iconElement = iconContainer.querySelector(".tab-group-icon");
            if (!iconElement) {
              iconElement = document.createElement("div");
              iconElement.className = "tab-group-icon";
              iconContainer.appendChild(iconElement);
            }

            // Clear any existing content and add the icon
            iconElement.innerHTML = "";
            const imgFrag = window.MozXULElement.parseXULToFragment(`
              <image src="${iconUrl}" class="group-icon" alt="Group Icon"/>
            `);
            iconElement.appendChild(imgFrag.firstElementChild);
          }
        }
      });
    } catch (error) {
      console.error("[AdvancedTabGroups] Error applying saved icons:", error);
    }
  }

  // Remove saved icon for a specific tab group
  async removeSavedIcon(groupId) {
    try {
      if (typeof UC_API !== "undefined" && UC_API.FileSystem) {
        try {
          // Read current icons
          const fsResult = await UC_API.FileSystem.readFile(
            "tab_group_icons.json"
          );
          if (fsResult.isContent()) {
            const icons = JSON.parse(fsResult.content());
            delete icons[groupId];

            // Save updated icons
            const jsonData = JSON.stringify(icons, null, 2);
            await UC_API.FileSystem.writeFile("tab_group_icons.json", jsonData);
          }
        } catch (fileError) {
          // No saved icon file found
        }
      } else {
        // Fallback to localStorage
        const savedIcons = localStorage.getItem("advancedTabGroups_icons");
        if (savedIcons) {
          const icons = JSON.parse(savedIcons);
          delete icons[groupId];
          localStorage.setItem(
            "advancedTabGroups_icons",
            JSON.stringify(icons)
          );
        }
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error removing saved icon:", error);
    }
  }

  // Public method to manually trigger color update for all groups
  updateAllGroupColors() {
    try {
      if (gBrowser.tabGroups) {
        gBrowser.tabGroups.forEach((group) => {
          if (!group.hasAttribute || !group.hasAttribute("split-view-group")) {
            if (typeof group._useFaviconColor === "function") {
              group._useFaviconColor();
            }
          }
        });
      } else {
        const groups = document.querySelectorAll("tab-group");
        groups.forEach((group) => {
          if (!group.hasAttribute("split-view-group")) {
            if (typeof group._useFaviconColor === "function") {
              group._useFaviconColor();
            }
          }
        });
      }
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
          getGroups: () => {
            if (gBrowser.tabGroups) {
              return Array.from(gBrowser.tabGroups).map(g => ({
                id: g.id,
                label: g.label,
                hasContextMenu: !!g._contextMenuAdded,
                hasColorFunction: typeof g._useFaviconColor === "function"
              }));
            } else {
              const groups = document.querySelectorAll("tab-group");
              return Array.from(groups).map(g => ({
                id: g.id,
                label: g.label,
                hasContextMenu: !!g._contextMenuAdded,
                hasColorFunction: typeof g._useFaviconColor === "function"
              }));
            }
          }
        };
        
        console.log("[AdvancedTabGroups] Debug functions available at globalThis.debugAdvancedTabGroups");
    }
    
    if (document.readyState === "complete") {
        initATG();
    } else {
        window.addEventListener("load", initATG);
    }

    // Clean up when the page is about to unload
    window.addEventListener("beforeunload", () => {
      if (globalThis.advancedTabGroups) {
        globalThis.advancedTabGroups.saveTabGroupColors();
      }
    });

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
        let inactiveGroupIds = [];
        if (gBrowser.tabGroups) {
          inactiveGroupIds = Array.from(gBrowser.tabGroups)
            .filter(g => !activeGroupIds.has(g.id) && (!g.hasAttribute || !g.hasAttribute("split-view-group")))
            .map(g => g.id);
        } else {
          // Fallback to DOM query if gBrowser.tabGroups is not available
          const allGroups = document.querySelectorAll("tab-group");
          inactiveGroupIds = Array.from(allGroups)
            .filter(g => !activeGroupIds.has(g.id) && !g.hasAttribute("split-view-group"))
            .map(g => g.id);
        }

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
