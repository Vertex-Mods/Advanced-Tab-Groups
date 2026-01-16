// ==UserScript==
// @name           Advanced Tab Groups
// @ignorecache
// ==/UserScript==
/* ==== Tab groups ==== */
/* https://github.com/Anoms12/Advanced-Tab-Groups */
/* ====== v3.2.1b ====== */

const UC_API = ChromeUtils.importESModule("chrome://userchromejs/content/uc_api.sys.mjs");

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
    const groups = document.querySelectorAll("tab-group");
    

    groups.forEach((group) => {
      // Skip split-view-groups
      if (!group.hasAttribute("split-view-group")) {
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
    if (this._groupEdited) return;
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
    if (document.activeElement === event.target || !this._groupEdited) {
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
        if (group) this.renameGroupStart(group);
      });
    }

    if (changeGroupIconItem) {
      changeGroupIconItem.addEventListener("command", () => {
        const group = this._contextMenuCurrentGroup;
        if (group) this.changeGroupIcon(group);
      });
    }

    if (ungroupTabsItem) {
      ungroupTabsItem.addEventListener("command", () => {
        const group = this._contextMenuCurrentGroup;
        if (group && typeof group.ungroupTabs === "function") {
          try {
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
        if (group) this.convertGroupToFolder(group);
      });
    }

    // Clear the current group when the menu closes (ready to be reused)
    contextMenu.addEventListener("popuphidden", () => {
      this._contextMenuCurrentGroup = null;
    });

    this._sharedContextMenu = contextMenu;
    return this._sharedContextMenu;
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
      console.log(
        "[AdvancedTabGroups] Added 'Convert Folder to Group' to context menu."
      );
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
      labelContainer.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._contextMenuCurrentGroup = group;
        sharedMenu.openPopupAtScreen(event.screenX, event.screenY, false);
      });
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
      console.log(
        "[AdvancedTabGroups] Use Average Favicon Color clicked for group:",
        group.id
      );

      // Capture 'this' for use in callbacks
      const self = this;

      try {
        // Get all favicon images directly from the group
        const favicons = group.querySelectorAll(".tab-icon-image");
        if (favicons.length === 0) {
          console.log("[AdvancedTabGroups] No favicons found in group");
          return;
        }

        console.log(
          "[AdvancedTabGroups] Found",
          favicons.length,
          "favicons in group"
        );

        // Extract colors from favicons
        const colors = [];
        let processedCount = 0;
        const totalFavicons = favicons.length;

        favicons.forEach((favicon, index) => {
          if (favicon && favicon.src) {
            console.log(
              "[AdvancedTabGroups] Processing favicon",
              index + 1,
              "of",
              totalFavicons,
              ":",
              favicon.src
            );

            // Create a canvas to analyze the favicon
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const img = new Image();

            img.onload = () => {
              try {
                canvas.width = img.width;
                canvas.height = img.height;
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
                  console.log(
                    "[AdvancedTabGroups] Extracted color from favicon",
                    index + 1,
                    ":",
                    avgColor
                  );
                } else {
                  console.log(
                    "[AdvancedTabGroups] No valid pixels found in favicon",
                    index + 1
                  );
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
                    console.log(
                      "[AdvancedTabGroups] Applied average favicon color to group:",
                      group.id,
                      "Color:",
                      colorString,
                      "from",
                      colors.length,
                      "favicons"
                    );

                    // Save the color to persistent storage
                    self.saveTabGroupColors();
                  } else {
                    console.log(
                      "[AdvancedTabGroups] No valid colors extracted from any favicons"
                    );
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
                  console.log(
                    "[AdvancedTabGroups] Applied average favicon color to group:",
                    group.id,
                    "Color:",
                    colorString,
                    "from",
                    colors.length,
                    "favicons (some failed)"
                  );

                  self.saveTabGroupColors();
                }
              }
            };

            img.onerror = () => {
              console.log(
                "[AdvancedTabGroups] Failed to load favicon",
                index + 1,
                ":",
                favicon.src
              );
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
                console.log(
                  "[AdvancedTabGroups] Applied average favicon color to group:",
                  group.id,
                  "Color:",
                  colorString,
                  "from",
                  colors.length,
                  "favicons (some failed to load)"
                );

                self.saveTabGroupColors();
              }
            };

            img.src = favicon.src;
          } else {
            console.log("[AdvancedTabGroups] Favicon", index + 1, "has no src");
            processedCount++;

            // Check if we're done processing
            if (processedCount === totalFavicons && colors.length > 0) {
              const finalColor = self._calculateAverageColor(colors);
              const colorString = `rgb(${finalColor[0]}, ${finalColor[1]}, ${finalColor[2]})`;

              group.style.setProperty("--tab-group-color", colorString);
              group.style.setProperty("--tab-group-color-invert", colorString);
              console.log(
                "[AdvancedTabGroups] Applied average favicon color to group:",
                group.id,
                "Color:",
                colorString,
                "from",
                colors.length,
                "favicons (some had no src)"
              );

              self.saveTabGroupColors();
            }
          }
        });

        if (favicons.length === 0) {
          console.log("[AdvancedTabGroups] No favicons found in group");
        }
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

      console.log(
        "[AdvancedTabGroups] Found",
        tabs.length,
        "tabs to convert to folder"
      );

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

        
      } else {
        
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

        // Get all tab groups and their colors (excluding split-view-groups)
        const groups = document.querySelectorAll("tab-group");
        groups.forEach((group) => {
          if (group.id && !group.hasAttribute("split-view-group")) {
            const color = group.style.getPropertyValue("--tab-group-color");
            if (color && color !== "") {
              colors[group.id] = color;
            }
          }
        });

        // Save to file
        const jsonData = JSON.stringify(colors, null, 2);
        await UC_API.FileSystem.writeFile("tab_group_colors.json", jsonData);
        
      } else {
        console.warn(
          "[AdvancedTabGroups] UC_API.FileSystem not available, using localStorage fallback"
        );
        // Fallback to localStorage if UC_API is not available
        const colors = {};
        const groups = document.querySelectorAll("tab-group");
        groups.forEach((group) => {
          if (group.id && !group.hasAttribute("split-view-group")) {
            const color = group.style.getPropertyValue("--tab-group-color");
            if (color && color !== "") {
              colors[group.id] = color;
            }
          }
        });
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
          console.log(
            "[AdvancedTabGroups] No saved color file found, starting fresh"
          );
        }
      } else {
        // Fallback to localStorage
        const savedColors = localStorage.getItem("advancedTabGroups_colors");
        if (savedColors) {
          colors = JSON.parse(savedColors);
          console.log(
            "[AdvancedTabGroups] Loaded colors from localStorage:",
            colors
          );
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
        const group = document.getElementById(groupId);
        if (group && !group.hasAttribute("split-view-group")) {
          group.style.setProperty("--tab-group-color", color);
          group.style.setProperty("--tab-group-color-invert", color);
          console.log(
            "[AdvancedTabGroups] Applied saved color to group:",
            groupId,
            color
          );
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
            console.log(
              "[AdvancedTabGroups] Removed saved color for group:",
              groupId
            );
          }
        } catch (fileError) {
          console.log(
            "[AdvancedTabGroups] No saved color file found to remove from"
          );
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
          console.log(
            "[AdvancedTabGroups] Removed saved color for group:",
            groupId
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
          console.log(
            "[AdvancedTabGroups] No saved icon file found, creating new one"
          );
        }

        // Update with new icon
        icons[groupId] = iconUrl;

        // Save to file
        const jsonData = JSON.stringify(icons, null, 2);
        await UC_API.FileSystem.writeFile("tab_group_icons.json", jsonData);
        console.log("[AdvancedTabGroups] Group icon saved:", groupId, iconUrl);
      } else {
        // Fallback to localStorage
        const savedIcons = localStorage.getItem("advancedTabGroups_icons");
        let icons = savedIcons ? JSON.parse(savedIcons) : {};
        icons[groupId] = iconUrl;
        localStorage.setItem("advancedTabGroups_icons", JSON.stringify(icons));
        console.log(
          "[AdvancedTabGroups] Group icon saved to localStorage:",
          groupId,
          iconUrl
        );
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
            console.log("[AdvancedTabGroups] Loaded icons from file:", icons);
          }
        } catch (fileError) {
          console.log("[AdvancedTabGroups] No saved icon file found");
        }
      } else {
        // Fallback to localStorage
        const savedIcons = localStorage.getItem("advancedTabGroups_icons");
        if (savedIcons) {
          icons = JSON.parse(savedIcons);
          console.log(
            "[AdvancedTabGroups] Loaded icons from localStorage:",
            icons
          );
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
        const group = document.getElementById(groupId);
        if (group && !group.hasAttribute("split-view-group")) {
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

            console.log(
              "[AdvancedTabGroups] Applied saved icon to group:",
              groupId,
              iconUrl
            );
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
            console.log(
              "[AdvancedTabGroups] Removed saved icon for group:",
              groupId
            );
          }
        } catch (fileError) {
          console.log(
            "[AdvancedTabGroups] No saved icon file found to remove from"
          );
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
          console.log(
            "[AdvancedTabGroups] Removed saved icon for group:",
            groupId
          );
        }
      }
    } catch (error) {
      console.error("[AdvancedTabGroups] Error removing saved icon:", error);
    }
  }
}

// Initialize when the page loads
(function () {
  if (!globalThis.advancedTabGroups) {
    function initATG() {
        console.log("[AdvancedTabGroups] Initializing");
        globalThis.advancedTabGroups = new AdvancedTabGroups();
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
        console.log(
          "[AdvancedTabGroups] Cleanup and save completed before page unload"
        );
      }
    });

    // Hide tab group menu items for folders in tab context menu
    const tabContextMenu = document.getElementById("tabContextMenu");
    if (tabContextMenu) {
      tabContextMenu.addEventListener("popupshowing", () => {
        // selecting folders to hide
        const foldersToHide = Array.from(
          gBrowser.tabContainer.querySelectorAll("zen-folder")
        ).map((f) => f.id);

        // finding menu items with tab group id
        const groupMenuItems = document.querySelectorAll(
          "#context_moveTabToGroupPopupMenu menuitem[tab-group-id]"
        );

        // Iterate over each item and hide one present in folderstohide array.
        for (const menuItem of groupMenuItems) {
          const tabGroupId = menuItem.getAttribute("tab-group-id");

          if (foldersToHide.includes(tabGroupId)) {
            menuItem.hidden = true;
          }
        }
      });
    }
    //  ^
    //  |
    // Thx to Bibek for this snippet! bibekbhusal on Discord.
  }
})();
