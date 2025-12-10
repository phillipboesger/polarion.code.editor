//
// avaCopilot-init.js
// -------------------
// Entry script for the avasis Copilot widget on Polarion rich text fields.
// It places an icon next to configured fields and shows a context menu with
// Copilot actions (e.g. compare versions, about dialog).
//

(function () {
  var IFRAME_SELECTOR = "iframe.polarion-rte-RichTextArea";
  var ICON_CLASS = "avaCopilot-icon";
  var CONTEXT_CLASS = "avaCopilot-context";

  var ICON_OFFSET_LEFT = -22; // adjust if necessary
  var ICON_OFFSET_TOP = 2;
  var PANEL_OFFSET_X = -4; // align panel roughly with the icon's left edge
  var PANEL_OFFSET_Y = 4; // small gap below the icon

  // Static configuration for all Copilot-enabled fields and actions.
  // In the future this can be replaced by a dynamic JSON / XML config.
  var AVA_COPILOT_CONFIG = {
    fields: [
      {
        id: "FIELD_changeContent",
        actions: ["compareLast", "compareVersion", "about"],
      },
    ],
    actions: {
      compareLast: {
        label: "Compare to last document version",
        iconSvg: [
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" class="avaCopilot-menu-svg avaCopilot-menu-svg-history">',
          '  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>',
          '  <path d="M3 3v5h5"></path>',
          '  <path d="M12 7v5l4 2"></path>',
          "</svg>",
        ].join(""),
      },
      compareVersion: {
        label: "Compare to document version...",
        iconSvg: [
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" class="avaCopilot-menu-svg avaCopilot-menu-svg-git-compare">',
          '  <circle cx="18" cy="18" r="3"></circle>',
          '  <circle cx="6" cy="6" r="3"></circle>',
          '  <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>',
          '  <path d="M11 18H8a 2 2 0 0 1-2-2V9"></path>',
          "</svg>",
        ].join(""),
      },
      about: {
        label: "About this extension",
        iconSvg: [
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" class="avaCopilot-menu-svg avaCopilot-menu-svg-info">',
          '  <circle cx="12" cy="12" r="10"></circle>',
          '  <path d="M12 16v-4"></path>',
          '  <path d="M12 8h.01"></path>',
          "</svg>",
        ].join(""),
      },
    },
  };

  /**
   * Safely attaches a click listener to an element.
   * The click event will not bubble further up the DOM tree.
   *
   * @param {HTMLElement|null} element - Target element for the listener.
   * @param {Function} handler - Function to execute on click.
   */
  function addClickListener(element, handler) {
    if (!element) {
      return;
    }

    element.addEventListener("click", function (event) {
      event.stopPropagation();
      handler(event);
    });
  }

  /**
   * Creates the Copilot icon overlay for a field cell or updates its position
   * if it already exists.
   *
   * @param {HTMLElement} fieldCell - The table cell that holds the RTE iframe.
   * @param {HTMLIFrameElement} iframe - The Polarion rich text iframe.
   */
  function createOrUpdateIcon(fieldCell, iframe) {
    if (getComputedStyle(fieldCell).position === "static") {
      fieldCell.classList.add("avaCopilot-field-cell");
    }

    var icon = fieldCell.querySelector("." + ICON_CLASS);
    if (!icon) {
      icon = document.createElement("span");
      icon.className = ICON_CLASS;
      icon.title = "avaCopilot - Your AI Assistant";

      addClickListener(icon, function () {
        toggleContextPanel(fieldCell, icon);
      });

      fieldCell.appendChild(icon);
    }

    var iframeRect = iframe.getBoundingClientRect();
    var cellRect = fieldCell.getBoundingClientRect();

    icon.style.left = iframeRect.left - cellRect.left + ICON_OFFSET_LEFT + "px";
    icon.style.top = iframeRect.top - cellRect.top + ICON_OFFSET_TOP + "px";
  }

  /**
   * Opens or closes the Copilot context panel for a field.
   * If the panel does not yet exist it will be created.
   *
   * @param {HTMLElement} fieldCell - Container cell for the field.
   * @param {HTMLElement} icon - The Copilot icon used as anchor element.
   */
  function toggleContextPanel(fieldCell, icon) {
    var panel = fieldCell.querySelector("." + CONTEXT_CLASS);
    var isOpen = panel && panel.style.display === "block";

    if (isOpen) {
      panel.style.display = "none";
      return;
    }

    if (!panel) {
      panel = buildContextPanel(fieldCell);
    }

    positionContextPanel(fieldCell, icon, panel);
    panel.style.display = "block";
  }

  /**
   * Central dispatcher for menu item clicks.
   * Maps an action key (e.g. "compareLast") to the corresponding behavior.
   *
   * @param {string} actionKey - Key of the selected action.
   * @param {HTMLElement} fieldCell - Associated field cell for the action.
   */
  function handleActionClick(actionKey, fieldCell) {
    switch (actionKey) {
      case "compareLast":
        console.log("Compare to last document version clicked");
        break;
      case "compareVersion":
        console.log("Compare to document version... clicked");
        break;
      case "about":
        openAboutDialog();
        break;
      default:
        return;
    }

    closeContextPanel(fieldCell);
  }

  /**
   * Builds the HTML structure for the Copilot context panel and wires
   * all hover and click handlers for the action buttons.
   *
   * @param {HTMLElement} fieldCell - Cell for which the panel is created.
   * @returns {HTMLDivElement} Newly created panel element.
   */
  function buildContextPanel(fieldCell) {
    var panel = document.createElement("div");
    panel.className = CONTEXT_CLASS;

    // Feld-Konfiguration ermitteln (aktuell: ein Feld, später mehrere möglich)
    var fieldId = fieldCell.id;
    var fieldCfg = AVA_COPILOT_CONFIG.fields.find(function (cfg) {
      return cfg.id === fieldId;
    });
    var actions = (fieldCfg && fieldCfg.actions) || [];

    var html = ['<div class="avaCopilot-menu">'];
    actions.forEach(function (actionKey, index) {
      var def = AVA_COPILOT_CONFIG.actions[actionKey];
      if (!def) {
        return;
      }

      if (index === 2) {
        html.push('<div class="avaCopilot-menu-separator"></div>');
      }

      html.push(
        '  <button type="button" class="avaCopilot-menu-item avaCopilot-action-' +
          actionKey +
          '">',
        '    <span class="avaCopilot-menu-icon">' +
          (def.iconSvg || "") +
          "</span>",
        '    <span class="avaCopilot-menu-label">' + def.label + "</span>",
        "  </button>"
      );
    });
    html.push("</div>");

    panel.innerHTML = html.join("");

    var menuItems = panel.querySelectorAll(".avaCopilot-menu-item");
    menuItems.forEach(function (item) {
      item.addEventListener("mouseenter", function () {
        item.classList.add("avaCopilot-menu-item-hover");
      });
      item.addEventListener("mouseleave", function () {
        item.classList.remove("avaCopilot-menu-item-hover");
      });
    });

    actions.forEach(function (actionKey) {
      var btn = panel.querySelector(".avaCopilot-action-" + actionKey);
      addClickListener(btn, function () {
        handleActionClick(actionKey, fieldCell);
      });
    });

    panel.addEventListener("click", function (event) {
      // prevent clicks inside the panel from bubbling up to document
      event.stopPropagation();
    });

    fieldCell.appendChild(panel);
    return panel;
  }

  function openAboutDialog() {
    if (document.querySelector(".avaCopilot-dialog")) {
      return;
    }

    var overlay = document.createElement("div");
    overlay.className = "avaCopilot-dialog-overlay";

    var dialog = document.createElement("div");
    dialog.className = "avaCopilot-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function closeDialog() {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }

    function wireDialogEvents() {
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          closeDialog();
        }
      });

      var closeIconBtn = dialog.querySelector(".avaCopilot-dialog-close-icon");
      if (closeIconBtn) {
        closeIconBtn.addEventListener("click", function () {
          closeDialog();
        });
      }
    }

    // Load dialog markup from external HTML resource served by the plugin.
    fetch("/polarion/ava-copilot/resources/html/avaCopilot-about.html")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Failed to load avaCopilot about dialog");
        }
        return response.text();
      })
      .then(function (html) {
        dialog.innerHTML = html;
        wireDialogEvents();
      })
      .catch(function () {
        // Wenn das Laden fehlschlägt, den Overlay wieder entfernen
        closeDialog();
      });
  }

  /**
   * Positions the context panel relative to the Copilot icon.
   *
   * @param {HTMLElement} fieldCell - Parent cell of icon and panel.
   * @param {HTMLElement} icon - Icon used as reference position.
   * @param {HTMLElement} panel - Panel that should be positioned.
   */
  function positionContextPanel(fieldCell, icon, panel) {
    var iconRect = icon.getBoundingClientRect();
    var cellRect = fieldCell.getBoundingClientRect();

    panel.style.left = iconRect.left - cellRect.left + PANEL_OFFSET_X + "px";
    panel.style.top = iconRect.bottom - cellRect.top + PANEL_OFFSET_Y + "px";
  }

  /**
   * Hides the context panel of the given field, if present.
   *
   * @param {HTMLElement} fieldCell - Cell that contains the context panel.
   */
  function closeContextPanel(fieldCell) {
    var panel = fieldCell.querySelector("." + CONTEXT_CLASS);
    if (panel) {
      panel.style.display = "none";
    }
  }

  /**
   * Iterates over all configured fields and creates / updates the Copilot
   * icon overlay next to their rich text iframe.
   */
  function placeIconOverlay() {
    AVA_COPILOT_CONFIG.fields.forEach(function (fieldCfg) {
      var fieldCell = document.getElementById(fieldCfg.id);
      if (!fieldCell) {
        return;
      }

      var iframe = fieldCell.querySelector(IFRAME_SELECTOR);
      if (!iframe) {
        return;
      }

      createOrUpdateIcon(fieldCell, iframe);
    });
  }

  /**
   * Initializes the avaCopilot integration on the current page.
   *
   * - Places initial icons
   * - Observes DOM changes to keep icons in sync
   * - Repositions on window resize
   * - Closes panels on document click
   */
  function init() {
    placeIconOverlay();

    var root = document.getElementById("ui_form_layout") || document.body;
    if (window.MutationObserver && root) {
      var observer = new MutationObserver(function () {
        placeIconOverlay();
      });
      observer.observe(root, { childList: true, subtree: true });
    } else {
      setInterval(placeIconOverlay, 2000);
    }

    window.addEventListener("resize", placeIconOverlay);

    document.addEventListener("click", function () {
      AVA_COPILOT_CONFIG.fields.forEach(function (fieldCfg) {
        var fieldCell = document.getElementById(fieldCfg.id);
        if (fieldCell) {
          closeContextPanel(fieldCell);
        }
      });
    });
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
