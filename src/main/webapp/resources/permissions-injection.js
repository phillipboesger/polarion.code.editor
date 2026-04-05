/* Polarion CodeEditor Permissions table-row injection
 * Intended to be loaded on Polarion Permissions Management pages.
 */
(function codeEditorPermissionsInjection() {
  "use strict";

  const LOG_PREFIX = "[code-editor permissions-injection]";
  const INJECTED_ATTR = "data-cepi-injected";
  const INJECTED_PERMISSION_ATTR = "data-cepi-permission-id";
  const GROUP_ROW_ATTR = "data-cepi-group-row";
  const CHILD_ROW_ATTR = "data-cepi-child-row";
  const EXPAND_ATTEMPT_ATTR = "data-cepi-expand-attempted";
  const TARGET_PERMISSIONS = ["boesger.codeeditor.read", "boesger.codeeditor.write"];
  let hasLoggedInitialization = false;
  let isInjecting = false;
  let initializeScheduled = false;

  function logInfo(message, data) {
    if (typeof console !== "undefined" && console.info) {
      console.info(LOG_PREFIX + " " + message, data || "");
    }
  }

  function logWarn(message, data) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(LOG_PREFIX + " " + message, data || "");
    }
  }

  function isPermissionsPage() {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return false;
    }
    const path = (window.location && window.location.pathname) || "";
    const hasPathHint = /permission/i.test(path) || /project\/.*\/administration/i.test(path);
    const hasDomHint =
      !!document.querySelector('[id="_ui_query_panel_toolbar"]') ||
      !!document.querySelector('[data-debug-id^="root/"]') ||
      !!document.querySelector(".JSTreeTable");
    return hasPathHint || hasDomHint;
  }

  function getRowsContainer() {
    return (
      document.querySelector(".JSTreeTable .main > div") ||
      document.querySelector(".JSTreeTable .main") ||
      document.querySelector(".JSTreeTable")
    );
  }

  function getAllRows() {
    return Array.from(document.querySelectorAll(".JSTreeTableRow"));
  }

  function getRowText(row) {
    return (row && row.textContent ? row.textContent : "").trim();
  }

  function isPermissionLikeId(value) {
    return /^[a-zA-Z0-9_.-]+$/.test(value) && value.includes(".");
  }

  function findRowByPermissionId(permissionId) {
    return getAllRows().find((row) => {
      const text = getRowText(row);
      return text.includes(permissionId);
    });
  }

  function hasInjectedPermissionRow(permissionId) {
    return !!document.querySelector(`.JSTreeTableRow[${INJECTED_PERMISSION_ATTR}="${permissionId}"][${CHILD_ROW_ATTR}="true"]`);
  }

  function getInjectedGroupRow() {
    return document.querySelector(`.JSTreeTableRow[${GROUP_ROW_ATTR}="true"]`);
  }

  function findTemplateRow() {
    const rows = getAllRows();
    let firstVisibleDataRow = null;
    for (const row of rows) {
      const text = getRowText(row);
      if (!text) {
        continue;
      }
      if (text.includes("root/") || text === "Projects" || text === "Work Items") {
        continue;
      }
      if (!firstVisibleDataRow) {
        firstVisibleDataRow = row;
      }
      if (!row.querySelector('input[type="checkbox"], input[type="radio"], select')) {
        continue;
      }
      const tokens = text.split(/\s+/).filter(Boolean);
      const idToken = tokens.find(isPermissionLikeId);
      if (idToken) {
        return { row, sourcePermissionId: idToken };
      }
    }

    if (firstVisibleDataRow) {
      // Fallback for pages where controls are not yet rendered.
      const fallbackSourceId = "com.polarion.persistence.object.project.read";
      return { row: firstVisibleDataRow, sourcePermissionId: fallbackSourceId };
    }

    return null;
  }

  function replaceAllAttributes(root, fromValue, toValue) {
    if (!fromValue || fromValue === toValue) {
      return;
    }

    const all = [root, ...Array.from(root.querySelectorAll("*"))];
    all.forEach((node) => {
      Array.from(node.attributes || []).forEach((attr) => {
        if (typeof attr.value === "string" && attr.value.includes(fromValue)) {
          node.setAttribute(attr.name, attr.value.split(fromValue).join(toValue));
        }
      });
    });

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      if (textNode.nodeValue && textNode.nodeValue.includes(fromValue)) {
        textNode.nodeValue = textNode.nodeValue.split(fromValue).join(toValue);
      }
      textNode = walker.nextNode();
    }
  }

  function clearSelectionVisuals(row) {
    row.classList.remove("selected", "hover");
    row.querySelectorAll(".selected, .hover").forEach((node) => {
      node.classList.remove("selected", "hover");
    });
  }

  function normalizeInputsForNewRow(row) {
    row.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((input) => {
      input.checked = false;
      input.removeAttribute("aria-checked");
    });
  }

  function removeInlineHandlers(row) {
    const all = [row, ...Array.from(row.querySelectorAll("*"))];
    all.forEach((node) => {
      const tagName = (node.tagName || "").toLowerCase();
      Array.from(node.attributes || []).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) {
          if (tagName === "input" || tagName === "select" || tagName === "option") {
            return;
          }
          node.removeAttribute(attr.name);
        }
      });
    });
  }

  function removeLegacyInjectedRows() {
    const oldRows = Array.from(
      document.querySelectorAll(`.JSTreeTableRow[${INJECTED_ATTR}="true"][${INJECTED_PERMISSION_ATTR}]`)
    ).filter((row) => row.getAttribute(CHILD_ROW_ATTR) !== "true");
    oldRows.forEach((row) => row.remove());
  }

  function injectGroupedPermissionRows() {
    removeLegacyInjectedRows();

    if (getInjectedGroupRow() && TARGET_PERMISSIONS.every((permissionId) => hasInjectedPermissionRow(permissionId))) {
      return;
    }

    const container = getRowsContainer();
    if (!container) {
      logWarn("rows container not found");
      return;
    }

    const template = findTemplateRow();
    if (!template) {
      logWarn("template row not found (table may still be collapsed)");
      return;
    }

    const parentRow = template.row.cloneNode(true);
    clearSelectionVisuals(parentRow);
    removeInlineHandlers(parentRow);
    parentRow.setAttribute(INJECTED_ATTR, "true");
    parentRow.setAttribute(GROUP_ROW_ATTR, "true");
    parentRow.removeAttribute(INJECTED_PERMISSION_ATTR);
    replaceAllAttributes(parentRow, template.sourcePermissionId, "Code Editor");
    parentRow.querySelectorAll('input[type="checkbox"], input[type="radio"], select').forEach((el) => el.remove());
    parentRow.style.cursor = "pointer";

    const toggle = document.createElement("span");
    toggle.textContent = "▶ ";
    toggle.setAttribute("data-cepi-toggle", "true");

    const firstTextHost =
      parentRow.querySelector("div, span, td") || parentRow;
    firstTextHost.prepend(toggle);

    const insertedRows = [parentRow];
    TARGET_PERMISSIONS.forEach((permissionId) => {
      if (hasInjectedPermissionRow(permissionId)) {
        return;
      }
      if (findRowByPermissionId(permissionId)) {
        return;
      }
      const childRow = template.row.cloneNode(true);
      clearSelectionVisuals(childRow);
      removeInlineHandlers(childRow);
      childRow.setAttribute(INJECTED_ATTR, "true");
      childRow.setAttribute(CHILD_ROW_ATTR, "true");
      childRow.setAttribute(INJECTED_PERMISSION_ATTR, permissionId);
      replaceAllAttributes(childRow, template.sourcePermissionId, permissionId);
      normalizeInputsForNewRow(childRow);

      const childLabelHost = childRow.querySelector("div, span, td");
      if (childLabelHost) {
        childLabelHost.style.paddingLeft = "22px";
      }
      childRow.style.display = "none";
      insertedRows.push(childRow);
    });

    const anchor = template.row.parentNode === container ? template.row : null;
    if (anchor) {
      let current = anchor;
      insertedRows.forEach((row) => {
        current.insertAdjacentElement("afterend", row);
        current = row;
      });
    } else {
      insertedRows.forEach((row) => container.appendChild(row));
    }

    let expanded = false;
    parentRow.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      expanded = !expanded;
      toggle.textContent = expanded ? "▼ " : "▶ ";
      insertedRows.slice(1).forEach((row) => {
        row.style.display = expanded ? "" : "none";
      });
    });

    logInfo("injected grouped permission row", "Code Editor");
  }

  function hasAnyPermissionRowsRendered() {
    return getAllRows().some((row) =>
      row.querySelector('input[type="checkbox"], input[type="radio"], select')
    );
  }

  function tryExpandAllOnce() {
    if (document.documentElement.hasAttribute(EXPAND_ATTEMPT_ATTR)) {
      return;
    }
    const buttons = Array.from(document.querySelectorAll("td, button, a, div"));
    const expandAll = buttons.find((el) => {
      const text = (el.textContent || "").trim();
      return text === "Expand All";
    });
    if (!expandAll) {
      return;
    }
    document.documentElement.setAttribute(EXPAND_ATTEMPT_ATTR, "true");
    if (typeof expandAll.click === "function") {
      expandAll.click();
      logInfo("clicked 'Expand All' to render permission rows");
    }
  }

  function initialize() {
    if (isInjecting) {
      return;
    }
    if (!isPermissionsPage()) {
      return;
    }
    if (!hasLoggedInitialization) {
      hasLoggedInitialization = true;
      logInfo("initializing on permissions page");
    }
    if (!hasAnyPermissionRowsRendered()) {
      tryExpandAllOnce();
    }
    isInjecting = true;
    try {
      injectGroupedPermissionRows();
    } finally {
      isInjecting = false;
    }
  }

  function scheduleInitialize() {
    if (initializeScheduled) {
      return;
    }
    initializeScheduled = true;
    requestAnimationFrame(() => {
      initializeScheduled = false;
      initialize();
    });
  }

  initialize();
  const observer = new MutationObserver(() => scheduleInitialize());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
