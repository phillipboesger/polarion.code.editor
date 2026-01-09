//
// avaCopilot-init.js
// -------------------
// Entry script for the avasis Copilot widget on Polarion rich text fields.
// It places an icon next to configured fields and shows a context menu with
// Copilot actions (e.g. compare versions, about dialog).
//

(function () {
  const IFRAME_SELECTOR = "iframe.polarion-rte-RichTextArea";
  const ICON_CLASS = "avaCopilot-icon";
  const CONTEXT_CLASS = "avaCopilot-context";

  // Tracks running backend requests per fieldCell so that the
  // Copilot icon can be used to cancel an in-flight request.
  const ACTIVE_REQUESTS = typeof WeakMap === "undefined" ? null : new WeakMap();

  const ICON_OFFSET_LEFT = -22; // adjust if necessary
  const ICON_OFFSET_TOP = 2;
  const PANEL_OFFSET_X = -4; // align panel roughly with the icon's left edge
  const PANEL_OFFSET_Y = 4; // small gap below the icon

  // Base paths for loading Copilot configurations via REST.
  // The final URLs are constructed dynamically based on the current project.
  const AVA_COPILOT_CONFIG_LIST_BASE =
    "/polarion/ava-copilot/api/projects/{projectId}/config/json";
  const AVA_COPILOT_CONFIG_FILE_BASE =
    "/polarion/ava-copilot/api/projects/{projectId}/config/json/{fileName}";

  // Effective runtime configuration loaded from AVA_COPILOT_CONFIG_ENDPOINT.
  // There is intentionally no built-in default; if the configuration
  // file cannot be loaded, no Copilot actions will be initialized.
  let AVA_COPILOT_CONFIG = null;

  // Built-in definition for the "about" action. This action is always
  // available from the plugin and will be appended as the last menu
  // entry for fields that define at least one custom action.
  const AVA_COPILOT_DEFAULT_ABOUT_ACTION = {
    label: "About this extension",
    iconSvg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" class="avaCopilot-menu-svg avaCopilot-menu-svg-info">' +
      '  <circle cx="12" cy="12" r="10"></circle>' +
      '  <path d="M12 16v-4"></path>' +
      '  <path d="M12 8h.01"></path>' +
      "</svg>",
  };

  /**
   * Returns the relevant Polarion path segments, independent of whether
   * Polarion currently uses a hash-based URL ("#/project/...") or a
   * regular path ("/polarion/project/...").
   *
   * Only the path part starting with "project" (and following segments
   * like "wiki", space, document id, ...) is relevant for our use cases.
   *
   * @returns {string[]} array of non-empty path segments
   */
  function getPolarionPathSegments() {
    let path = "";

    // Prefer the hash part if present (classic Polarion SPAs),
    // otherwise fall back to the normal pathname.
    const hash = globalThis.location.hash || ""; // e.g. "#/project/..."
    if (hash) {
      path = hash.startsWith("#") ? hash.substring(1) : hash;
    } else {
      path = globalThis.location.pathname || "";
    }

    if (!path) {
      return [];
    }

    // Remove parameters from the path (e.g. ?sidebar=...)
    const urlParametersIdx = path.indexOf("?");
    if (urlParametersIdx !== -1) {
      path = path.substring(0, urlParametersIdx);
    }

    // Normalize: strip leading slash and everything before "/project/"
    const projectIdx = path.indexOf("/project/");
    if (projectIdx !== -1) {
      path = path.substring(projectIdx + 1); // keep leading "project/..."
    }

    if (path.startsWith("/")) {
      path = path.substring(1);
    }

    return path.split("/").filter(function (segment) {
      return !!segment;
    });
  }

  /**
   * Helper to safely decode a URI component.
   * @param {string} segment
   * @returns {string}
   */
  function decodeSegment(segment) {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch (e) {
      console.warn("avaCopilot: failed to decode segment", e);
    }

    // Strip query parameters if present (e.g. if they were encoded)
    const qIdx = decoded.indexOf("?");
    if (qIdx !== -1) {
      decoded = decoded.substring(0, qIdx);
    }
    return decoded;
  }

  /**
   * Tries to extract the current Polarion project id from the browser URL.
   *
   * Examples:
   *   http://localhost/polarion/#/project/avaWorkflow/wiki/...
   *   -> returns "avaWorkflow".
   *
   * @returns {string|null} project id or null if it cannot be determined
   */
  function getCurrentProjectIdFromUrl() {
    const segments = getPolarionPathSegments();
    const projectIndex = segments.indexOf("project");

    if (projectIndex !== -1 && projectIndex + 1 < segments.length) {
      return decodeSegment(segments[projectIndex + 1]);
    }

    return null;
  }

  /**
   * Tries to extract the current document context (project, space, id)
   * from the Polarion URL.
   *
   * Example path/hash:
   *   /project/avaWorkflow/wiki/LiveDocTemplates/template_liveDoc
   *   -> projectId = "avaWorkflow"
   *      spaceId   = "LiveDocTemplates"
   *      documentId= "template_liveDoc"
   *
   * For our current use cases it is enough if at least the project
   * (and optional "wiki" part) can be determined. If no relevant
   * segment is found, null is returned.
   *
   * @returns {{projectId:string|null, spaceId:string|null, documentId:string|null}}
   *          or null if it cannot be determined.
   */
  function getCurrentDocumentContextFromUrl() {
    const segments = getPolarionPathSegments();
    const projectIndex = segments.indexOf("project");

    if (projectIndex === -1 || projectIndex + 1 >= segments.length) {
      return null;
    }

    const projectId = decodeSegment(segments[projectIndex + 1]);
    let spaceId = null;
    let documentId = null;

    // Look for "wiki" after the project ID
    // We start searching after the project ID segment
    const wikiIndex = segments.indexOf("wiki", projectIndex + 2);
    if (wikiIndex !== -1 && wikiIndex + 2 < segments.length) {
      spaceId = decodeSegment(segments[wikiIndex + 1]);
      documentId = decodeSegment(segments[wikiIndex + 2]);
    }

    return {
      projectId: projectId,
      spaceId: spaceId,
      documentId: documentId,
    };
  }
  /**
   * Constructs the URL for listing available configuration files for a project.
   *
   * @param {string} [projectId="global"] - The project ID or "global".
   * @returns {string} The URL to fetch the configuration list.
   */
  function buildConfigListUrl(projectId = "global") {
    return AVA_COPILOT_CONFIG_LIST_BASE.replace(
      "{projectId}",
      encodeURIComponent(projectId)
    );
  }

  /**
   * Encodes path segments for URL usage, preserving slashes.
   *
   * @param {string} path - The path to encode.
   * @returns {string} The encoded path.
   */
  function encodePathSegments(path) {
    return String(path)
      .split("/")
      .map(function (segment) {
        return encodeURIComponent(segment);
      })
      .join("/");
  }

  /**
   * Constructs the URL for fetching a specific configuration file.
   *
   * @param {string} projectId - The project ID.
   * @param {string} fileName - The name of the configuration file.
   * @returns {string} The URL to fetch the configuration file.
   */
  function buildConfigFileUrl(projectId, fileName) {
    const pid = projectId || "global";
    return AVA_COPILOT_CONFIG_FILE_BASE.replace(
      "{projectId}",
      encodeURIComponent(pid)
    ).replace("{fileName}", encodePathSegments(fileName));
  }

  /**
   * Builds a URL to an icon resource stored in the .avasis folder
   * (typically under ".avasis/avaCopilot/...").
   *
   * The JSON configuration should provide a relative path like
   *   "avaCopilot/icons/compareLast.svg".
   *
   * Relative paths are resolved via the Copilot REST servlet using
   * a dedicated "img" format, so that different image types
   * (SVG, PNG, JPG, ...) can be served with an appropriate
   * content type.
   *
   * If the value already looks like an absolute URL (starts with
   * "http://", "https://" or "/"), it is returned unchanged.
   *
   * @param {string} iconPath - Relative or absolute icon path.
   * @returns {string} Fully qualified URL for use in <img src>.
   */
  function buildIconUrl(iconPath) {
    if (!iconPath || typeof iconPath !== "string") {
      return "";
    }

    // Absolute URLs or root-relative paths are used as-is.
    if (
      iconPath.startsWith("http://") ||
      iconPath.startsWith("https://") ||
      iconPath.startsWith("/")
    ) {
      return iconPath;
    }

    const projectId = getCurrentProjectIdFromUrl() || "global";
    const encodedPath = encodePathSegments(iconPath);

    // Use dedicated "img" format so the backend can
    // determine the correct image content type based on
    // the file extension.
    return (
      "/polarion/ava-copilot/api/projects/" +
      encodeURIComponent(projectId) +
      "/config/img/" +
      encodedPath
    );
  }

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

    let icon = fieldCell.querySelector("." + ICON_CLASS);
    if (!icon) {
      icon = document.createElement("span");
      icon.className = ICON_CLASS;
      icon.title = "avaCopilot - Your AI Assistant";

      addClickListener(icon, function () {
        toggleContextPanel(fieldCell, icon);
      });

      fieldCell.appendChild(icon);
    }

    const iframeRect = iframe.getBoundingClientRect();
    const cellRect = fieldCell.getBoundingClientRect();

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
    // If a backend action is currently running for this field, treat
    // a click on the icon as a cancel request instead of opening
    // the context panel.
    if (ACTIVE_REQUESTS?.has(fieldCell)) {
      cancelActiveRequest(fieldCell);
      return;
    }

    let panel = fieldCell.querySelector("." + CONTEXT_CLASS);
    const isOpen = panel?.style?.display === "block";

    if (isOpen) {
      closeContextPanel(fieldCell);
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
   * @param {HTMLElement} [actionElement] - The button element that was clicked.
   */
  function handleActionClick(actionKey, fieldCell, actionElement) {
    // Built-in client-side action: about dialog.
    if (actionKey === "about") {
      openAboutDialog();
      closeContextPanel(fieldCell);
      return;
    }

    if (!AVA_COPILOT_CONFIG?.actions) {
      console.warn(
        "avaCopilot: no configuration available to execute action '",
        actionKey,
        "'"
      );
      closeContextPanel(fieldCell);
      return;
    }

    const definition = AVA_COPILOT_CONFIG.actions[actionKey];
    if (!definition) {
      console.warn(
        "avaCopilot: no action definition found for key '",
        actionKey,
        "'"
      );
      closeContextPanel(fieldCell);
      return;
    }

    // Backend execution via avasis core REST interface (Velocity).
    if (
      definition.backend?.type === "velocity" &&
      definition.backend.avasisPath
    ) {
      // Check if we should keep the panel open (e.g. for side-panel UI)
      let uiMode = definition.uiMode || "writeToField";

      if (uiMode === "sidePanel") {
        // Don't close panel. Show loading on the item itself.
        if (actionElement) {
          actionElement.classList.add("avaCopilot-loading");
        }
        executeVelocityAction(
          actionKey,
          definition,
          fieldCell,
          actionElement,
          uiMode
        );
      } else {
        // Standard behavior: close panel, show loading on field
        closeContextPanel(fieldCell);
        executeVelocityAction(
          actionKey,
          definition,
          fieldCell,
          actionElement,
          uiMode
        );
      }
      return;
    }

    console.warn(
      "avaCopilot: action '",
      actionKey,
      "' has no executable backend configuration"
    );
    closeContextPanel(fieldCell);
  }

  /**
   * Helper to execute scripts in a container.
   */
  function executeScripts(container) {
    const scripts = container.querySelectorAll("script");
    scripts.forEach(function (oldScript) {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach(function (attr) {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.appendChild(document.createTextNode(oldScript.innerHTML));
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  /**
   * Dispatches change events to the iframe to notify Polarion of updates.
   *
   * @param {Document} iframeDoc - The document within the iframe.
   * @param {Window} iframeWin - The window object of the iframe.
   */
  function dispatchChangeEvents(iframeDoc, iframeWin) {
    const events = ["input", "change", "keyup", "blur"];
    events.forEach(function (type) {
      let evt;
      if (type === "keyup") {
        evt = new KeyboardEvent(type, {
          bubbles: true,
          cancelable: true,
          view: iframeWin,
          key: " ",
          code: "Space",
          keyCode: 32,
          which: 32,
        });
      } else {
        evt = new Event(type, {
          bubbles: true,
          cancelable: true,
          view: iframeWin,
        });
      }
      iframeDoc.body.dispatchEvent(evt);
    });
  }

  /**
   * Updates the content of the rich text iframe and triggers change events.
   */
  function updateIframeContent(fieldCell, content) {
    const iframe = fieldCell?.querySelector?.(IFRAME_SELECTOR);

    if (!iframe) {
      console.warn(
        "avaCopilot: no rich text iframe found for field '",
        fieldCell?.id,
        "' to apply backend result"
      );
      return;
    }

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

    if (!iframeDoc?.body) {
      console.warn(
        "avaCopilot: rich text iframe document/body not accessible for field '",
        fieldCell?.id,
        "'"
      );
      return;
    }

    try {
      iframeDoc.body.innerHTML = content;

      // Trigger Polarion's change detection mechanism.
      if (iframeDoc.body.focus) {
        iframeDoc.body.focus();
      }

      dispatchChangeEvents(iframeDoc, iframe.contentWindow);
    } catch (error) {
      console.error(
        "avaCopilot: failed to write backend result into rich text field '",
        fieldCell?.id,
        "':",
        error
      );
    }
  }

  /**
   * Handles the successful response from a Velocity backend action.
   *
   * @param {Object} result - The JSON result from the server.
   * @param {string} actionKey - The action key.
   * @param {HTMLElement} fieldCell - The field cell.
   * @param {string} uiMode - The UI mode.
   */
  function handleVelocitySuccess(result, actionKey, fieldCell, uiMode) {
    if (result?.status !== "success") {
      console.warn(
        "avaCopilot: backend action '",
        actionKey,
        "' returned non-success status",
        result
      );
      return;
    }

    const data = result.data;
    if (typeof data !== "string") {
      console.warn(
        "avaCopilot: backend action '",
        actionKey,
        "' returned data that is not a string:",
        data
      );
      return;
    }

    // Determine target based on explicit uiMode parameter
    switch (uiMode) {
      case "sidePanel":
        showSidePanel(fieldCell, data);
        break;

      case "dialog":
      case "modal": {
        // Render in a standalone container appended to the body
        const uiContainer = document.createElement("div");
        uiContainer.innerHTML = data;
        document.body.appendChild(uiContainer);
        executeScripts(uiContainer);
        break;
      }

      case "writeToField":
      default:
        // Default behavior: write content into the rich text field
        updateIframeContent(fieldCell, data);
        break;
    }
  }

  /**
   * Executes a Velocity-based backend action via the avasis core REST
   * interface. The action definition must provide a backend configuration
   * with type "velocity" and an "avasisPath" pointing to the Velocity file.
   *
   * The request is sent to:
   *   /polarion/ava-rest/{projectId}/velocity
   * with a JSON payload similar to:
   *   { projectId: "PRJ", avasisPath: "path/to/file.vm", fieldId: "...", uiMode: "..." }
   *
   * @param {string} actionKey - Key of the selected action.
   * @param {Object} definition - Action configuration object.
   * @param {HTMLElement} fieldCell - Associated field cell for context.
   * @param {HTMLElement} [actionElement] - The button element that was clicked (for sidePanel mode).
   * @param {string} [uiMode] - The UI mode ("writeToField", "sidePanel", "dialog").
   * @param {Object} [runtimeParams] - Additional parameters to pass to the backend.
   */
  function prepareVelocityPayload(
    projectId,
    definition,
    fieldCell,
    runtimeParams,
    uiMode
  ) {
    const backend = definition.backend || {};
    const avasisPath = backend.avasisPath;
    const extraParams =
      backend.params && typeof backend.params === "object"
        ? backend.params
        : {};

    const safeRuntimeParams = runtimeParams || {};

    const payload = {
      ...extraParams,
      ...safeRuntimeParams,
      projectId: projectId,
      avasisPath: avasisPath,
      fieldId: fieldCell?.id || null,
      uiMode: uiMode || "writeToField",
    };

    if (backend.includeDocumentContext) {
      const docCtx = getCurrentDocumentContextFromUrl();
      if (docCtx) {
        payload.documentProjectId = docCtx.projectId || projectId;
        payload.documentSpaceId = docCtx.spaceId || null;
        payload.documentId = docCtx.documentId || null;
      }
    }
    return payload;
  }

  /**
   * Sets up the UI for a loading state (overlay and icon) unless in sidePanel mode.
   *
   * @param {HTMLElement} fieldCell - The field cell element.
   * @param {Object} definition - The action definition.
   * @param {string} uiMode - The UI mode ("writeToField" or "sidePanel").
   * @param {Object} [runtimeParams] - Runtime parameters containing optional overrides.
   */
  function setupVelocityLoadingUI(
    fieldCell,
    definition,
    uiMode,
    runtimeParams
  ) {
    if (uiMode === "sidePanel") {
      return;
    }

    const backend = definition.backend || {};
    let loadingLabel = definition.label || "Action";

    if (runtimeParams?.loadingLabel) {
      loadingLabel = runtimeParams.loadingLabel;
    } else if (backend.params?.loadingLabel) {
      loadingLabel = backend.params.loadingLabel;
    }

    showLoadingOverlay(fieldCell, loadingLabel);
    setIconLoadingState(
      fieldCell,
      true,
      "Click to cancel '" + loadingLabel + "'"
    );
  }

  function executeVelocityAction(
    actionKey,
    definition,
    fieldCell,
    actionElement,
    uiMode,
    runtimeParams
  ) {
    const projectId = getCurrentProjectIdFromUrl();
    if (!projectId) {
      console.warn(
        "avaCopilot: cannot execute backend action '",
        actionKey,
        "' because projectId could not be determined from URL"
      );
      if (!actionElement) closeContextPanel(fieldCell);
      return;
    }

    const backend = definition.backend || {};
    const avasisPath = backend.avasisPath;
    if (!avasisPath) {
      console.warn(
        "avaCopilot: backend configuration for action '",
        actionKey,
        "' is missing 'avasisPath'"
      );
      if (!actionElement) closeContextPanel(fieldCell);
      return;
    }

    const url =
      "/polarion/ava-rest/" + encodeURIComponent(projectId) + "/velocity";

    const payload = prepareVelocityPayload(
      projectId,
      definition,
      fieldCell,
      runtimeParams,
      uiMode
    );

    // Optional AbortController for user cancellation.
    const controller = globalThis.AbortController
      ? new AbortController()
      : null;
    if (ACTIVE_REQUESTS && controller) {
      ACTIVE_REQUESTS.set(fieldCell, {
        controller: controller,
        actionKey: actionKey,
      });
    }

    setupVelocityLoadingUI(fieldCell, definition, uiMode, runtimeParams);

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify(payload),
    };
    if (controller) {
      fetchOptions.signal = controller.signal;
    }

    fetch(url, fetchOptions)
      .then(function (response) {
        if (!response.ok) {
          throw new Error(
            "avaCopilot: backend action '" +
              actionKey +
              "' failed with HTTP " +
              response.status
          );
        }
        return response.json();
      })
      .then(function (result) {
        handleVelocitySuccess(result, actionKey, fieldCell, uiMode);
      })
      .catch(function (error) {
        // If aborted by the user, an AbortError is thrown.
        // We log only for information.
        if (error?.name === "AbortError") {
          console.log(
            "avaCopilot: backend action '",
            actionKey,
            "' aborted by user"
          );
        } else {
          console.error(
            "avaCopilot: error executing backend action '",
            actionKey,
            "':",
            error
          );
        }
      })
      .finally(function () {
        clearActiveRequest(fieldCell);

        if (actionElement) {
          actionElement.classList.remove("avaCopilot-loading");
        }

        // Only close panel if NOT in sidePanel mode
        if (uiMode !== "sidePanel") {
          closeContextPanel(fieldCell);
        }
      });
  }

  /**
   * Shows a side panel attached to the context menu.
   */
  function showSidePanel(fieldCell, contentHtml) {
    const panel = fieldCell.querySelector("." + CONTEXT_CLASS);
    if (!panel) return;

    // Ensure parent panel is visible (in case it was hidden)
    panel.style.display = "block";

    let sidePanel = panel.querySelector(".avaCopilot-side-panel");
    if (!sidePanel) {
      sidePanel = document.createElement("div");
      sidePanel.className = "avaCopilot-side-panel";

      // Generic event delegation for actions inside the side panel
      sidePanel.addEventListener("click", function (event) {
        const trigger = event.target.closest("[data-ava-action]");
        if (!trigger) return;

        event.stopPropagation();
        const actionKey = trigger.dataset.avaAction;
        const paramsStr = trigger.dataset.avaParams;
        let params = {};
        if (paramsStr) {
          try {
            params = JSON.parse(paramsStr);
          } catch (e) {
            console.warn("avaCopilot: invalid params JSON", e);
          }
        }

        if (globalThis.avaCopilotExecuteAction && fieldCell.id) {
          globalThis.avaCopilotExecuteAction(actionKey, fieldCell.id, params);
        }
      });

      panel.appendChild(sidePanel);
    }

    sidePanel.innerHTML = contentHtml;
    sidePanel.style.display = "block";
    executeScripts(sidePanel);
  }

  /**
   * Builds the HTML structure for the Copilot context panel and wires
   * all hover and click handlers for the action buttons.
   *
   * @param {HTMLElement} fieldCell - Cell for which the panel is created.
   * @returns {HTMLDivElement} Newly created panel element.
   */
  function buildContextPanel(fieldCell) {
    const panel = document.createElement("div");
    panel.className = CONTEXT_CLASS;

    if (
      !AVA_COPILOT_CONFIG ||
      !Array.isArray(AVA_COPILOT_CONFIG.fields) ||
      !AVA_COPILOT_CONFIG.actions
    ) {
      return panel;
    }

    // Determine field configuration (currently one field, more possible later)
    const fieldId = fieldCell.id;
    const fieldCfg = AVA_COPILOT_CONFIG.fields.find(function (cfg) {
      return cfg.id === fieldId;
    });
    const actions = fieldCfg?.actions || [];

    const html = ['<div class="avaCopilot-menu">'];
    actions.forEach(function (actionKey, index) {
      const def = AVA_COPILOT_CONFIG.actions[actionKey];
      if (!def) {
        return;
      }

      // Separate the built-in "about" action visually from the
      // preceding actions, if there are any.
      if (actionKey === "about" && index > 0) {
        html.push('<div class="avaCopilot-menu-separator"></div>');
      }

      let iconHtml = "";
      if (def.iconSvg) {
        // Backwards-compatible: inline SVG from configuration.
        iconHtml = def.iconSvg;
      } else if (def.iconPath || def.iconImage) {
        // New: path to an image (e.g. SVG) stored under .avasis.
        const iconUrl = buildIconUrl(def.iconPath || def.iconImage);
        if (iconUrl) {
          iconHtml =
            '<img src="' +
            iconUrl +
            '" class="avaCopilot-menu-img" alt="" aria-hidden="true" />';
        }
      }

      html.push(
        '  <button type="button" class="avaCopilot-menu-item avaCopilot-action-' +
          actionKey +
          '">',
        '    <span class="avaCopilot-menu-icon">' + iconHtml + "</span>",
        '    <span class="avaCopilot-menu-label">' + def.label + "</span>",
        "  </button>"
      );
    });
    html.push("</div>");

    panel.innerHTML = html.join("");

    const menuItems = panel.querySelectorAll(".avaCopilot-menu-item");
    menuItems.forEach(function (item) {
      item.addEventListener("mouseenter", function () {
        item.classList.add("avaCopilot-menu-item-hover");
      });
      item.addEventListener("mouseleave", function () {
        item.classList.remove("avaCopilot-menu-item-hover");
      });
    });

    actions.forEach(function (actionKey) {
      const btn = panel.querySelector(".avaCopilot-action-" + actionKey);
      addClickListener(btn, function () {
        handleActionClick(actionKey, fieldCell, btn);
      });
    });

    panel.addEventListener("click", function (event) {
      // prevent clicks inside the panel from bubbling up to document
      event.stopPropagation();
    });

    fieldCell.appendChild(panel);
    return panel;
  }

  /**
   * Opens the "About" dialog for the extension.
   * Creates the dialog overlay if it doesn't exist.
   */
  function openAboutDialog() {
    if (document.querySelector(".avaCopilot-dialog")) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "avaCopilot-dialog-overlay";

    const dialog = document.createElement("div");
    dialog.className = "avaCopilot-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function closeDialog() {
      if (overlay?.parentNode) {
        overlay.remove();
      }
    }

    function wireDialogEvents() {
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          closeDialog();
        }
      });

      const closeIconBtn = dialog.querySelector(
        ".avaCopilot-dialog-close-icon"
      );
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
        // If loading fails, remove the overlay again
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
    const iconRect = icon.getBoundingClientRect();
    const cellRect = fieldCell.getBoundingClientRect();

    panel.style.left = iconRect.left - cellRect.left + PANEL_OFFSET_X + "px";
    panel.style.top = iconRect.bottom - cellRect.top + PANEL_OFFSET_Y + "px";
  }

  /**
   * Hides the context panel of the given field, if present.
   * Also removes any open side panels and clears loading states.
   *
   * @param {HTMLElement} fieldCell - Cell that contains the context panel.
   */
  function closeContextPanel(fieldCell) {
    const panel = fieldCell.querySelector("." + CONTEXT_CLASS);
    if (panel) {
      panel.style.display = "none";

      // Remove side panel if present
      const sidePanel = panel.querySelector(".avaCopilot-side-panel");
      sidePanel?.remove();

      // Remove loading state from all items
      const loadingItems = panel.querySelectorAll(".avaCopilot-loading");
      loadingItems.forEach(function (item) {
        item.classList.remove("avaCopilot-loading");
      });
    }
  }

  /**
   * Shows a loading overlay with spinning Avasis logo and tool title
   * on top of the given field cell while a backend action is running.
   *
   * @param {HTMLElement} fieldCell - Cell containing the rich text field.
   * @param {string} title - Title of the running tool.
   */
  function showLoadingOverlay(fieldCell, title) {
    if (!fieldCell) {
      return;
    }

    // Ensure positioning context for the overlay.
    if (getComputedStyle(fieldCell).position === "static") {
      fieldCell.classList.add("avaCopilot-field-cell");
    }

    // Clean up existing overlay (and timer) if present
    hideLoadingOverlay(fieldCell);

    const overlay = document.createElement("div");
    overlay.className = "avaCopilot-loading-overlay";

    const content = document.createElement("div");
    content.className = "avaCopilot-loading-content";

    const logo = document.createElement("div");
    logo.className = "avaCopilot-loading-logo";

    const titleEl = document.createElement("div");
    titleEl.className = "avaCopilot-loading-title";

    // Title text
    const textSpan = document.createElement("span");
    textSpan.textContent = title || "avaCopilot is thinking...";
    titleEl.appendChild(textSpan);

    // Timer text
    const timerSpan = document.createElement("span");
    timerSpan.className = "avaCopilot-loading-timer";
    timerSpan.textContent = "(0s)";
    titleEl.appendChild(timerSpan);

    content.appendChild(logo);
    content.appendChild(titleEl);
    overlay.appendChild(content);

    fieldCell.appendChild(overlay);

    // Start timer
    let seconds = 0;
    const timerId = setInterval(function () {
      seconds++;
      let timeText;
      if (seconds < 60) {
        timeText = "(" + seconds + "s)";
      } else {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        timeText = "(" + m + "m " + s + "s)";
      }
      timerSpan.textContent = timeText;
    }, 1000);

    // Attach timer ID to overlay for cleanup
    overlay._avaTimerId = timerId;
  }

  /**
   * Removes the loading overlay from the given field cell, if present.
   *
   * @param {HTMLElement} fieldCell - Cell from which to remove the overlay.
   */
  function hideLoadingOverlay(fieldCell) {
    if (!fieldCell) {
      return;
    }

    const overlay = fieldCell.querySelector(".avaCopilot-loading-overlay");
    if (overlay) {
      if (overlay._avaTimerId) {
        clearInterval(overlay._avaTimerId);
        overlay._avaTimerId = null;
      }
      if (overlay.parentNode) {
        overlay.remove();
      }
    }
  }

  /**
   * Applies or removes the loading state on the Copilot icon for
   * a given field cell, optionally adjusting its tooltip text.
   *
   * @param {HTMLElement} fieldCell
   * @param {boolean} isLoading
   * @param {string=} title Optional tooltip text.
   */
  function setIconLoadingState(fieldCell, isLoading, title) {
    if (!fieldCell) {
      return;
    }

    const icon = fieldCell.querySelector("." + ICON_CLASS);
    if (!icon) {
      return;
    }

    if (isLoading) {
      icon.classList.add("avaCopilot-icon-loading");
      if (title) {
        icon.title = title;
      }
    } else {
      icon.classList.remove("avaCopilot-icon-loading");
      if (title) {
        icon.title = title;
      } else {
        icon.title = "avaCopilot - Your AI Assistant";
      }
    }
  }

  /**
   * Clears the active request state for a field, hides the
   * loading overlay and restores the icon.
   *
   * @param {HTMLElement} fieldCell
   */
  function clearActiveRequest(fieldCell) {
    if (ACTIVE_REQUESTS?.has(fieldCell)) {
      ACTIVE_REQUESTS.delete(fieldCell);
    }
    hideLoadingOverlay(fieldCell);
    setIconLoadingState(fieldCell, false);
  }

  /**
   * Cancels an in-flight backend request for the given field cell
   * using AbortController (if available) and restores UI state.
   *
   * @param {HTMLElement} fieldCell
   */
  function cancelActiveRequest(fieldCell) {
    if (!fieldCell || !ACTIVE_REQUESTS) {
      clearActiveRequest(fieldCell);
      return;
    }

    const entry = ACTIVE_REQUESTS.get(fieldCell);
    if (!entry) {
      clearActiveRequest(fieldCell);
      return;
    }

    const controller = entry.controller;
    if (controller && typeof controller.abort === "function") {
      controller.abort();
    }

    clearActiveRequest(fieldCell);
  }

  /**
   * Iterates over all configured fields and creates / updates the Copilot
   * icon overlay next to their rich text iframe.
   */
  function placeIconOverlay() {
    if (!AVA_COPILOT_CONFIG || !Array.isArray(AVA_COPILOT_CONFIG.fields)) {
      return;
    }

    AVA_COPILOT_CONFIG.fields.forEach(function (fieldCfg) {
      const fieldCell = document.getElementById(fieldCfg.id);
      if (!fieldCell) {
        return;
      }

      const iframe = fieldCell.querySelector(IFRAME_SELECTOR);
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

    const root = document.getElementById("ui_form_layout") || document.body;
    if (globalThis.MutationObserver && root) {
      const observer = new MutationObserver(function () {
        placeIconOverlay();
      });
      observer.observe(root, { childList: true, subtree: true });
    } else {
      setInterval(placeIconOverlay, 2000);
    }

    globalThis.addEventListener("resize", placeIconOverlay);

    document.addEventListener("click", function () {
      if (!AVA_COPILOT_CONFIG || !Array.isArray(AVA_COPILOT_CONFIG.fields)) {
        return;
      }

      AVA_COPILOT_CONFIG.fields.forEach(function (fieldCfg) {
        const fieldCell = document.getElementById(fieldCfg.id);
        if (fieldCell) {
          closeContextPanel(fieldCell);
        }
      });
    });
  }

  /**
   * Fetches JSON data from the given URL.
   *
   * @param {string} url - The URL to fetch.
   * @returns {Promise<Object>} A promise resolving to the JSON object.
   */
  function fetchJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (response) {
      if (!response.ok) {
        const error = new Error(
          "Failed to load avaCopilot configuration: HTTP " + response.status
        );
        error.status = response.status;
        throw error;
      }
      return response.json();
    });
  }

  /**
   * Helper to merge a single field configuration into the merged object.
   *
   * @param {Object} field - The field configuration to merge.
   * @param {Object} merged - The accumulator object for merged configurations.
   * @param {Object} fieldIndexById - Map of field IDs to their index in the merged array.
   */
  function mergeFieldConfig(field, merged, fieldIndexById) {
    if (!field?.id) {
      return;
    }

    const existing = fieldIndexById[field.id];
    if (existing === undefined) {
      // First occurrence of this field: take it over completely
      const clone = {
        id: field.id,
        actions: Array.isArray(field.actions) ? field.actions.slice() : [],
      };
      fieldIndexById[field.id] = merged.fields.length;
      merged.fields.push(clone);
    } else {
      // Field already exists: merge actions
      const target = merged.fields[existing];
      const sourceActions = Array.isArray(field.actions) ? field.actions : [];
      sourceActions.forEach(function (actionKey) {
        if (!target.actions.includes(actionKey)) {
          target.actions.push(actionKey);
        }
      });
    }
  }

  /**
   * Merges multiple configuration objects into a single one.
   *
   * @param {Array<Object>} configs - Array of configuration objects.
   * @returns {Object} The merged configuration object.
   */
  function mergeConfigs(configs) {
    const merged = { fields: [], actions: {} };
    const fieldIndexById = {};

    configs.forEach(function (cfg) {
      if (!cfg || typeof cfg !== "object") {
        return;
      }

      if (Array.isArray(cfg.fields)) {
        cfg.fields.forEach(function (field) {
          mergeFieldConfig(field, merged, fieldIndexById);
        });
      }

      if (cfg.actions && typeof cfg.actions === "object") {
        Object.assign(merged.actions, cfg.actions);
      }
    });

    return merged;
  }

  /**
   * Appends the default "about" action to all configured fields.
   *
   * @param {Object} config - The configuration object.
   * @returns {Object} The configuration object with the "about" action validation.
   */
  function applyDefaultAbout(config) {
    if (!config || typeof config !== "object") {
      return config;
    }

    if (!config.actions || typeof config.actions !== "object") {
      config.actions = {};
    }

    // Always provide the built-in "about" action from the plugin.
    config.actions.about = AVA_COPILOT_DEFAULT_ABOUT_ACTION;

    if (Array.isArray(config.fields)) {
      config.fields.forEach(function (field) {
        if (!field) {
          return;
        }

        const actions = Array.isArray(field.actions) ? field.actions : [];
        if (!Array.isArray(field.actions)) {
          field.actions = actions;
        }

        const hasNonAbout = actions.some(function (key) {
          return key !== "about";
        });
        const hasAbout = actions.includes("about");

        // Append "about" as last option only if there is at least
        // one other action for this field.
        if (hasNonAbout && !hasAbout) {
          field.actions.push("about");
        }
      });
    }

    return config;
  }

  /**
   * Fetches a single configuration file.
   *
   * @param {Object} file - The file object containing the fileName.
   * @param {string} projectIdOrGlobal - The project ID or "global".
   * @returns {Promise<Object|null>} A promise resolving to the config object or null.
   */
  function fetchConfigFile(file, projectIdOrGlobal) {
    if (!file?.fileName) {
      return Promise.resolve(null);
    }
    const url = buildConfigFileUrl(projectIdOrGlobal, file.fileName);
    return fetchJson(url)
      .then(function (cfg) {
        if (!cfg || typeof cfg !== "object") {
          console.warn(
            "avaCopilot: JSON configuration '" +
              file.fileName +
              "' is not a valid object and will be ignored"
          );
          return null;
        }
        return cfg;
      })
      .catch(function (error) {
        console.warn(
          "avaCopilot: failed to load JSON configuration '" +
            file.fileName +
            "' from " +
            url,
          error
        );
        return null;
      });
  }

  /**
   * Processes a list of configuration files by fetching them in parallel.
   *
   * @param {Array} files - List of file objects.
   * @param {string} projectIdOrGlobal - Project ID or "global".
   * @param {string} label - Label for logging.
   * @param {string} listUrl - The source URL for logging.
   * @returns {Promise<Array>} A promise resolving to an array of valid configuration objects.
   */
  function fetchValidConfigs(files, projectIdOrGlobal, label, listUrl) {
    if (!Array.isArray(files) || files.length === 0) {
      console.warn(
        "avaCopilot: no " +
          label +
          " JSON configurations returned from " +
          listUrl
      );
      return Promise.resolve([]);
    }

    const filePromises = files.map(function (file) {
      return fetchConfigFile(file, projectIdOrGlobal);
    });
    return Promise.all(filePromises).then(function (cfgs) {
      return cfgs.filter(function (c) {
        return c !== null;
      });
    });
  }

  /**
   * Orchestrates the loading of configurations for a specific scope (project or global).
   *
   * @param {string} projectIdOrGlobal - Project ID or "global".
   * @param {string} label - Context label for logging.
   * @returns {Promise<Array>} A promise resolving to an array of loaded configuration objects.
   */
  function fetchConfigsForScope(projectIdOrGlobal, label) {
    const listUrl = buildConfigListUrl(projectIdOrGlobal);

    return fetchJson(listUrl)
      .then(function (files) {
        return fetchValidConfigs(files, projectIdOrGlobal, label, listUrl);
      })
      .catch(function (error) {
        console.warn(
          "avaCopilot: failed to list " +
            label +
            " JSON configurations from " +
            listUrl,
          error
        );
        return [];
      });
  }

  /**
   * Loads the Copilot configuration from the backend REST endpoint.
   * If loading fails or the response is not valid JSON, the default
   * configuration will be used instead. Once the configuration is
   * available, the main initialization is triggered.
   */
  function loadConfigAndInit() {
    const projectId = getCurrentProjectIdFromUrl();

    let scopeId;
    let label;
    if (projectId) {
      scopeId = projectId;
      label = "project/global";
    } else {
      console.warn(
        "avaCopilot: could not determine current projectId from URL, using global configurations only"
      );
      scopeId = "global";
      label = "global";
    }

    fetchConfigsForScope(scopeId, label).then(function (configs) {
      if (!configs || configs.length === 0) {
        console.warn(
          "avaCopilot: no usable JSON configurations found for project or global scope"
        );
        return;
      }

      let merged = mergeConfigs(configs);
      merged = applyDefaultAbout(merged);
      if (!Array.isArray(merged.fields) || merged.fields.length === 0) {
        console.warn(
          "avaCopilot: merged configuration does not contain any fields; Copilot actions will not be initialized"
        );
        return;
      }

      AVA_COPILOT_CONFIG = merged;
      init();
    });
  }

  // Expose a global API for the side panel scripts to trigger actions
  globalThis.avaCopilotExecuteAction = function (actionKey, fieldId, params) {
    const fieldCell = document.getElementById(fieldId);
    if (!fieldCell) return;

    if (!AVA_COPILOT_CONFIG?.actions) return;
    const definition = AVA_COPILOT_CONFIG.actions[actionKey];
    if (!definition) return;

    // Close the context panel (and side panel) before starting the action
    closeContextPanel(fieldCell);

    // Force uiMode to writeToField to ensure panel closes and result is written
    executeVelocityAction(
      actionKey,
      definition,
      fieldCell,
      null,
      "writeToField",
      params
    );
  };

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    loadConfigAndInit();
  } else {
    document.addEventListener("DOMContentLoaded", loadConfigAndInit);
  }
})();
