/* Polarion CodeEditor Permissions table-row injection
 * Intended to be loaded on Polarion Permissions Management pages.
 */
(function () {
  "use strict";

  /* ── Configuration ─────────────────────────────────────────────────── */

  var PERMISSIONS = [
    {
      id: "boesger.codeeditor.read",
      label: "Permission to READ",
      description: "Controls the permission to read files in the Code Editor.",
    },
    {
      id: "boesger.codeeditor.write",
      label: "Permission to WRITE",
      description:
        "Controls the permission to write/save files in the Code Editor.",
    },
  ];

  // Roles are populated dynamically from Polarion's own permission detail panel.
  var ROLES = [];

  /* ── State ──────────────────────────────────────────────────────────── */

  var _expanded = false;
  var _roleDone = false;
  var _grantedMap = {}; // permId → { roleName: null|true|false }
  var _activePermId = null;
  var _customSets = []; // [{ id, name, filter, grants:{permId:{role:null|true|false}} }]
  var _editingSetId = null; // id of set being edited, or 'new'
  var _setEditBuffer = {}; // working copy when editing a set
  var _dirty = false; // true when grants changed but not yet saved to backend
  var _savedSnapshot = null; // snapshot of _grantedMap at last successful save (for Cancel)
  var _cepiActive = false; // true when any cepi row is selected
  var _globalGrantedMap = {}; // global-scope grants, used as inheritance baseline in project scope
  var _lastKnownProjectId; // undefined = not yet tracked; used to detect scope switches

  /* ── DOM helpers ────────────────────────────────────────────────────── */

  function isTargetPage() {
    // Only activate on the Polarion Permissions Management page.
    // The SPA URL hash contains "permissions" (or "globalPermissions") for both
    // global scope (#/administration/permissions) and project scope
    // (#/project/PROJID/administration/permissions).
    // Without this check the script would inject into any admin view that uses
    // a JSTreeTable (Projects, Users, Groups, …).
    if (!/permissions/i.test(location.hash)) return false;

    return !!(
      document.querySelector(".JSTreeTable") ||
      document.querySelector('[data-debug-id^="root/"]')
    );
  }

  function getContainer() {
    var rows = document.querySelectorAll(
      ".JSTreeTableRow:not([data-cepi-parent]):not([data-cepi-child])",
    );
    return rows.length ? rows[rows.length - 1] : null;
  }

  function isInjected() {
    return !!document.querySelector("[data-cepi-parent]");
  }

  /* ── Image path helpers ─────────────────────────────────────────────── */

  function imgPaths() {
    var imgs = document.querySelectorAll("img[src*='polarion/ria/images/']");
    for (var i = 0; i < imgs.length; i++) {
      var attr = imgs[i].getAttribute("src") || "";
      var mBase = attr.match(/^(.*\/polarion\/ria\/images\/)/);
      var mBid = attr.match(/(\?buildId=[^&\s"']+)/);
      if (mBase) return { base: mBase[1], bid: mBid ? mBid[1] : "" };
    }
    return { base: "/polarion/ria/images/", bid: "" };
  }

  function labelColWidth() {
    var el = document.querySelector(
      ".JSTreeTableCell[data-debug-id='JSTreeTableColumnId-label']",
    );
    return el ? parseInt(el.style.width, 10) || 1080 : 1080;
  }

  /* ── HTML builders (exact Polarion JSTreeTable structure) ───────────── */

  function parentLabelHtml(base, bid, w) {
    var icon = base + "tree/L+.svg" + bid;
    var file = "/polarion/code-editor/resources/img/code-editor-icon-light.svg";
    return (
      '<div class="JSTreeTableCell fixed" style="width:' +
      w +
      'px"' +
      ' data-debug-id="JSTreeTableColumnId-label">' +
      '<div class="content" style="width:' +
      w +
      'px">' +
      '<table cellspacing="0" cellpadding="0" class="dataTable"><tbody><tr>' +
      '<td colspan="0" rowspan="0" valign="top" class="dataCell">' +
      '<table cellspacing="0" cellpadding="0"><tbody><tr>' +
      '<td class="treeIconContainer">' +
      '<img class="goThroughLine" data-cepi-icon="toggle" src="' +
      icon +
      '" style="cursor:pointer;">' +
      "</td>" +
      "</tr></tbody></table>" +
      "</td>" +
      '<td colspan="0" rowspan="0" valign="middle" class="dataCell"' +
      ' style="padding-left:0px;width:100%">' +
      '<table data-debug-id="root/Code Editor"><tbody><tr>' +
      '<td style="white-space:nowrap;">' +
      '<img style="vertical-align:middle;border:0px;margin-right:2px;width:16px;height:16px;" src="' +
      file +
      '">' +
      "</td>" +
      '<td style="white-space:nowrap;">Code Editor</td>' +
      "</tr></tbody></table>" +
      "</td>" +
      "</tr></tbody></table>" +
      "</div>" +
      "</div>"
    );
  }

  function childLabelHtml(perm, isLast, base, bid, w) {
    var blank = base + "blank.gif" + bid;
    var tree = base + (isLast ? "tree/L.gif" : "tree/T.gif") + bid;
    var cls = isLast ? "treeIconContainerHalf" : "treeIconContainerThroughLine";
    var file = base + "file.gif" + bid;
    return (
      '<div class="JSTreeTableCell fixed" style="width:' +
      w +
      'px"' +
      ' data-debug-id="JSTreeTableColumnId-label">' +
      '<div class="content" style="width:' +
      w +
      'px">' +
      '<table cellspacing="0" cellpadding="0" class="dataTable"><tbody><tr>' +
      '<td colspan="0" rowspan="0" valign="top" class="dataCell">' +
      '<table cellspacing="0" cellpadding="0"><tbody><tr>' +
      '<td><img class="goThroughLine" src="' +
      blank +
      '"></td>' +
      '<td class="' +
      cls +
      '">' +
      '<img class="goThroughLine" src="' +
      tree +
      '">' +
      "</td>" +
      "</tr></tbody></table>" +
      "</td>" +
      '<td colspan="0" rowspan="0" valign="middle" class="dataCell"' +
      ' style="padding-left:0px;width:100%">' +
      '<table data-debug-id="Code Editor/' +
      perm.label +
      '"><tbody><tr>' +
      '<td style="white-space:nowrap;">' +
      '<img style="vertical-align:middle;border:0px;margin-right:2px;" src="' +
      file +
      '">' +
      "</td>" +
      '<td style="white-space:nowrap;">' +
      perm.label +
      "</td>" +
      "</tr></tbody></table>" +
      "</td>" +
      "</tr></tbody></table>" +
      "</div>" +
      "</div>"
    );
  }

  /* ── Toggle ─────────────────────────────────────────────────────────── */

  function applyToggle(parentRow) {
    var p = imgPaths();
    var icon = parentRow.querySelector("[data-cepi-icon='toggle']");
    if (icon) {
      icon.src = p.base + "tree/" + (_expanded ? "L-.svg" : "L+.svg") + p.bid;
    }
    document.querySelectorAll("[data-cepi-child]").forEach(function (r) {
      r.style.display = _expanded ? "" : "none";
    });
  }

  /* ── Role-column cloning ────────────────────────────────────────────── */

  function replaceId(root, from, to) {
    if (!from || from === to) return;
    (function walk(el) {
      Array.from(el.attributes || []).forEach(function (a) {
        if (a.value.indexOf(from) !== -1)
          el.setAttribute(a.name, a.value.split(from).join(to));
      });
      Array.from(el.childNodes).forEach(function (c) {
        if (c.nodeType === 3 && c.nodeValue && c.nodeValue.indexOf(from) !== -1)
          c.nodeValue = c.nodeValue.split(from).join(to);
        else if (c.nodeType === 1) walk(c);
      });
    })(root);
  }

  function tryAddRoleCells() {
    if (_roleDone) return;
    var childRows = document.querySelectorAll("[data-cepi-child]");
    if (!childRows.length) return;

    var allRows = document.querySelectorAll(
      ".JSTreeTableRow:not([data-cepi-parent]):not([data-cepi-child])",
    );
    var leaf = null,
      sourcePid = null;
    for (var i = 0; i < allRows.length; i++) {
      if (allRows[i].querySelector("input, select")) {
        leaf = allRows[i];
        var m = (leaf.textContent || "").match(
          /\b([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){2,})\b/,
        );
        sourcePid = m ? m[1] : null;
        break;
      }
    }
    if (!leaf) return;

    var roleCells = Array.from(
      leaf.querySelectorAll(".JSTreeTableCell"),
    ).filter(function (c) {
      return c.getAttribute("data-debug-id") !== "JSTreeTableColumnId-label";
    });
    if (!roleCells.length) return;

    childRows.forEach(function (childRow) {
      if (childRow.querySelectorAll(".JSTreeTableCell").length > 1) return;
      var targetPid = childRow.getAttribute("data-cepi-pid");
      roleCells.forEach(function (cell) {
        var clone = cell.cloneNode(true);
        clone.classList.remove("selected", "hover");
        clone.querySelectorAll(".selected,.hover").forEach(function (n) {
          n.classList.remove("selected", "hover");
        });
        clone
          .querySelectorAll("input[type=checkbox],input[type=radio]")
          .forEach(function (inp) {
            inp.checked = false;
            inp.removeAttribute("aria-checked");
          });
        clone.querySelectorAll("*").forEach(function (el) {
          if (!/^(input|select|option|textarea)$/i.test(el.tagName)) {
            Array.from(el.attributes || []).forEach(function (a) {
              if (/^on/i.test(a.name)) el.removeAttribute(a.name);
            });
          }
        });
        replaceId(clone, sourcePid, targetPid);
        childRow.appendChild(clone);
      });
    });

    _roleDone = true;
    console.info("[cepi] role columns added");
  }

  /* ── Role extraction from Polarion's native detail panel ───────────── */

  function extractRolesFromPanel(panelEl) {
    if (!panelEl) return false;
    // Don't parse our own injected panel
    if (panelEl.querySelector("#_ui_cepi_form_layouter")) return false;

    var tables = panelEl.querySelectorAll("table");
    for (var t = 0; t < tables.length; t++) {
      var ths = tables[t].querySelectorAll("th");
      if (ths.length < 2) continue;
      if (
        (ths[0].textContent || "").trim() !== "Role" ||
        (ths[1].textContent || "").trim() !== "Scope"
      )
        continue;

      var extracted = [];
      var trs = tables[t].querySelectorAll("tbody tr");
      for (var i = 0; i < trs.length; i++) {
        // Only direct <td> children – avoid nested table cells
        var tds = Array.from(trs[i].children).filter(function (c) {
          return c.tagName === "TD";
        });
        if (tds.length >= 2) {
          var name = (tds[0].textContent || "").trim();
          var scope = (tds[1].textContent || "").trim();
          if (name) extracted.push({ name: name, scope: scope });
        }
      }

      if (extracted.length > 0) {
        ROLES = extracted;
        PERMISSIONS.forEach(function (perm) {
          if (!_grantedMap[perm.id]) _grantedMap[perm.id] = {};
          ROLES.forEach(function (role) {
            // Nur fehlende Einträge (undefined) auffüllen – niemals explizit
            // auf false setzen, da das einen Deny erzeugen würde. Rollen ohne
            // Eintrag in der XML sind "nicht gesetzt" = null (grau), nicht deny.
            if (!Object.prototype.hasOwnProperty.call(_grantedMap[perm.id], role.name)) {
              _grantedMap[perm.id][role.name] = null;
            }
          });
        });
        // Snapshot aktualisieren, damit Cancel nicht neu entdeckte Rollen verliert
        if (!_dirty) {
          _savedSnapshot = deepCloneGrants(_grantedMap);
        }
        console.info(
          "[cepi] extracted " + ROLES.length + " roles from Polarion panel",
        );
        return true;
      }
    }
    return false;
  }

  function tryExtractRoles() {
    var candidates = document.querySelectorAll(
      ".polarion-PreviewForm-Content, .polarion-PreviewForm-ContentContainer",
    );
    for (var i = 0; i < candidates.length; i++) {
      if (extractRolesFromPanel(candidates[i])) return true;
    }
    return false;
  }

  /* ── Detail panel helpers ───────────────────────────────────────────── */

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Return image src for a grant state: null=grey-checkmark, true=green-grant, false=red-deny */
  function grantImg(p, state) {
    if (state === true) return p.base + "checkbox/yes.png" + p.bid;
    if (state === false) return p.base + "checkbox/no.png" + p.bid;
    return p.base + "checkbox/yesGrey.png" + p.bid; // null / undefined
  }

  /**
   * In project scope: if project has no explicit value, show the global value in grey.
   * Grey-grant (yesGrey) = inherited grant from global.
   * Grey-deny  (noGrey)  = inherited deny from global.
   * Falls back to neutral yesGrey when nothing is set anywhere.
   */
  function grantImgProject(p, projectState, globalState) {
    if (projectState === true) return p.base + "checkbox/yes.png" + p.bid; // explicit grant
    if (projectState === false) return p.base + "checkbox/no.png" + p.bid; // explicit deny
    // null: show what's inherited from global (greyed)
    if (globalState === true) return p.base + "checkbox/yesGrey.png" + p.bid;
    if (globalState === false) return p.base + "checkbox/noGrey.png" + p.bid;
    return p.base + "checkbox/yesGrey.png" + p.bid; // nothing anywhere
  }

  /** Build the title/tooltip text for a role cell in project scope. */
  function grantTitleProject(projectState, globalState) {
    if (projectState === true) return "Granted (project-specific)";
    if (projectState === false) return "Denied (project-specific)";
    if (globalState === true)
      return "Inherited: Grant (from global – click to override)";
    if (globalState === false)
      return "Inherited: Deny (from global – click to override)";
    return "Not set – click to cycle: grant → deny → reset";
  }

  /** Cycle grant state: null → true → false → null */
  function cycleGrant(current) {
    if (current === null || current === undefined) return true;
    if (current === true) return false;
    return null;
  }

  /** Detect current project scope from the URL (#/project/ID/... vs global) */
  function _currentProjectId() {
    var m = location.hash.match(/#\/?project\/([^/]+)/);
    return m ? m[1] : null;
  }

  function _fetchGlobalGrants(callback) {
    // Always fetches without projectId (= global scope)
    var url = _apiBase() + "/permissions";
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            if (data && data.grants) {
              _globalGrantedMap = data.grants;
              callback(true);
              return;
            }
          } catch (e) {}
        }
        callback(false);
      };
      xhr.send();
    } catch (e) {
      callback(false);
    }
  }

  function _afterGrantsLoaded() {
    PERMISSIONS.forEach(function (perm) {
      if (!_grantedMap[perm.id]) _grantedMap[perm.id] = {};
      ROLES.forEach(function (role) {
        if (
          !Object.prototype.hasOwnProperty.call(_grantedMap[perm.id], role.name)
        ) {
          _grantedMap[perm.id][role.name] = null;
        }
      });
    });
    _savedSnapshot = deepCloneGrants(_grantedMap);
    _dirty = false;
    if (_activePermId) {
      renderDetailPanel();
      cepiEnterMode();
    }
  }

  /**
   * Versioned, scope-specific localStorage key.
   * The v2 prefix ignores stale data written by older code (which incorrectly
   * saved null values as explicit false, causing phantom red denies on reload).
   */
  function _grantsStorageKey() {
    return "cepi-grants-v2-" + (_currentProjectId() || "global");
  }

  function loadGrants() {
    var projectId = _currentProjectId();
    if (projectId) {
      // In project scope: load global first (for inheritance), then project-specific
      _fetchGlobalGrants(function () {
        _fetchGrantsFromBackend(function (loaded) {
          if (!loaded) {
            try {
              var s = localStorage.getItem(_grantsStorageKey());
              if (s) _grantedMap = JSON.parse(s);
            } catch (e) {}
          }
          _afterGrantsLoaded();
        });
      });
    } else {
      // Global scope: also set _globalGrantedMap from the same fetch
      _fetchGrantsFromBackend(function (loaded) {
        if (!loaded) {
          try {
            var s = localStorage.getItem(_grantsStorageKey());
            if (s) _grantedMap = JSON.parse(s);
          } catch (e) {}
        }
        _globalGrantedMap = _grantedMap; // global == itself
        _afterGrantsLoaded();
      });
    }
  }

  function saveGrants() {
    // Mirror to localStorage as fast session cache (scoped + versioned key)
    try {
      localStorage.setItem(_grantsStorageKey(), JSON.stringify(_grantedMap));
    } catch (e) {}
    // Mark dirty so Save/Cancel buttons become active
    setCepiButtonsDirty(true);
  }

  function _apiBase() {
    return "/polarion/code-editor/api";
  }

  function _fetchGrantsFromBackend(callback) {
    var projectId = _currentProjectId();
    var url =
      _apiBase() +
      "/permissions" +
      (projectId ? "?projectId=" + encodeURIComponent(projectId) : "");
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            if (data && data.grants) {
              _grantedMap = data.grants;
              callback(true);
            } else {
              callback(false);
            }
          } catch (e) {
            callback(false);
          }
        } else {
          callback(false);
        }
      };
      xhr.send();
    } catch (e) {
      callback(false);
    }
  }

  function _pushGrantsToBackend() {
    var projectId = _currentProjectId();
    var url =
      _apiBase() +
      "/permissions" +
      (projectId ? "?projectId=" + encodeURIComponent(projectId) : "");
    // Only send explicit grant (true) / deny (false) – omit null/undefined (grey = not set = absent in XML)
    var filteredGrants = {};
    Object.keys(_grantedMap).forEach(function (permId) {
      filteredGrants[permId] = {};
      var roleMap = _grantedMap[permId];
      if (roleMap) {
        Object.keys(roleMap).forEach(function (role) {
          if (roleMap[role] === true || roleMap[role] === false) {
            filteredGrants[permId][role] = roleMap[role];
          }
        });
      }
    });
    var body = JSON.stringify({ grants: filteredGrants });
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(body);
    } catch (e) {}
  }

  function loadCustomSets() {
    try {
      var stored = localStorage.getItem("cepi-custom-sets");
      if (stored) _customSets = JSON.parse(stored);
    } catch (e) {
      _customSets = [];
    }
  }

  function saveCustomSets() {
    try {
      localStorage.setItem("cepi-custom-sets", JSON.stringify(_customSets));
    } catch (e) {}
  }

  function genId() {
    return "set-" + Math.random().toString(36).slice(2, 9);
  }

  /* ── Group detail panel (click on "Code Editor" row body) ───────────── */

  function buildCustomSetEditorHtml(set) {
    // set = null means new set
    var name = set ? escHtml(set.name || "") : "";
    var filter = set ? escHtml(set.filter || "") : "";
    var thStyle =
      "white-space:nowrap;color:#757575;font-weight:normal;border-bottom:1px solid #d5d6da;" +
      "height:28px;padding:0 4px;vertical-align:middle;text-align:left;";
    var tdStyle =
      "white-space:nowrap;border-bottom:1px solid #D2D7DA;padding:0 4px;height:28px;vertical-align:middle;";

    var p = imgPaths();
    var rolesSection = "";
    if (ROLES.length > 0) {
      var permCols = PERMISSIONS.map(function (perm) {
        return (
          '<th class="polarion-TableDataHeader" style="' +
          thStyle +
          '">' +
          escHtml(perm.label) +
          "</th>"
        );
      }).join("");

      var roleRows = ROLES.map(function (role) {
        var cells = PERMISSIONS.map(function (perm) {
          var state =
            set && set.grants && set.grants[perm.id]
              ? set.grants[perm.id][role.name]
              : null;
          // normalize old boolean values
          if (state === false && _setEditBuffer && _setEditBuffer[perm.id])
            state = _setEditBuffer[perm.id][role.name];
          return (
            '<td class="polarion-TableDataRow" style="' +
            tdStyle +
            'text-align:center;">' +
            '<img src="' +
            grantImg(p, state) +
            '"' +
            ' data-cepi-set-toggle="' +
            escHtml(perm.id) +
            ":" +
            escHtml(role.name) +
            '"' +
            ' style="cursor:pointer;display:inline-block;vertical-align:middle;">' +
            "</td>"
          );
        }).join("");
        return (
          "<tr>" +
          '<td class="polarion-TableDataRow" style="' +
          tdStyle +
          '">' +
          escHtml(role.name) +
          "</td>" +
          '<td class="polarion-TableDataRow" style="' +
          tdStyle +
          '">' +
          escHtml(role.scope) +
          "</td>" +
          cells +
          "</tr>"
        );
      }).join("");

      rolesSection =
        '<div class="polarion-JSPreviewPanelTitleClick" style="margin-top:8px;">' +
        '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody><tr>' +
        '<td class="polarion-JSPreviewPanel-TitleTd">Role Grants (click to cycle: grey \u2192 green \u2192 red)</td>' +
        "</tr></tbody></table></div>" +
        '<table cellspacing="0" cellpadding="0" class="polarion-JSPreviewPanel-PanelFixed">' +
        '<tbody><tr><td style="padding:0 10px;width:100%;">' +
        '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">' +
        "<tbody><tr>" +
        '<th class="polarion-TableDataHeader" style="' +
        thStyle +
        '">Role</th>' +
        '<th class="polarion-TableDataHeader" style="' +
        thStyle +
        '">Scope</th>' +
        permCols +
        "</tr>" +
        roleRows +
        "</tbody></table>" +
        "</td></tr></tbody></table>";
    }

    return (
      '<div class="GLNRHCCBOBB" style="margin-top:8px;">' +
      '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody>' +
      '<tr><td class="polarion-NameCell"><span>Name:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell">' +
      '<input type="text" data-cepi-set-name value="' +
      name +
      '" style="width:100%;box-sizing:border-box;">' +
      "</td></tr>" +
      '<tr><td class="polarion-NameCell"><span>Filter:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell">' +
      '<input type="text" data-cepi-set-filter value="' +
      filter +
      '" placeholder="e.g. *.java, src/**, text/xml" style="width:100%;box-sizing:border-box;">' +
      "</td></tr>" +
      "</tbody></table></div>" +
      rolesSection +
      '<div style="margin-top:10px;display:flex;gap:8px;">' +
      '<span class="polarion-ToolbarButton-Label" data-cepi-action="set-save"' +
      ' style="cursor:pointer;padding:3px 10px;border:1px solid #aaa;background:#f5f5f5;border-radius:2px;">Save Set</span>' +
      '<span class="polarion-ToolbarButton-Label" data-cepi-action="set-cancel"' +
      ' style="cursor:pointer;padding:3px 10px;border:1px solid #aaa;background:#f5f5f5;border-radius:2px;">Cancel</span>' +
      "</div>"
    );
  }

  function buildGroupDetailHtml(p) {
    var permList = PERMISSIONS.map(function (perm) {
      return (
        "<li style='margin-bottom:8px;'>" +
        "<tt>" +
        escHtml(perm.id) +
        "</tt> &ndash; <strong>" +
        escHtml(perm.label) +
        "</strong>" +
        "<br><span style='color:#555;'>" +
        escHtml(perm.description || "") +
        "</span>" +
        "</li>"
      );
    }).join("");

    // ── Custom Sets section ──────────────────────────────────────────────
    var thStyle =
      "white-space:nowrap;color:#757575;font-weight:normal;border-bottom:1px solid #d5d6da;height:28px;padding:0 4px;vertical-align:middle;text-align:left;";
    var tdStyle =
      "white-space:nowrap;border-bottom:1px solid #D2D7DA;padding:0 4px;height:32px;vertical-align:middle;";

    var setsRows = _customSets
      .map(function (set) {
        return (
          "<tr>" +
          '<td class="polarion-TableDataRow" style="' +
          tdStyle +
          '">' +
          escHtml(set.name || "") +
          "</td>" +
          '<td class="polarion-TableDataRow" style="' +
          tdStyle +
          '"><tt>' +
          escHtml(set.filter || "") +
          "</tt></td>" +
          '<td class="polarion-TableDataRow" style="' +
          tdStyle +
          'text-align:right;white-space:nowrap;">' +
          '<span data-cepi-action="set-edit" data-cepi-set-id="' +
          escHtml(set.id) +
          '"' +
          ' style="cursor:pointer;margin-right:6px;color:#1a7fbc;" title="Edit">&#9998;</span>' +
          '<span data-cepi-action="set-delete" data-cepi-set-id="' +
          escHtml(set.id) +
          '"' +
          ' style="cursor:pointer;color:#c00;" title="Delete">&times;</span>' +
          "</td></tr>"
        );
      })
      .join("");

    var setsTable =
      _customSets.length > 0
        ? '<table cellspacing="0" cellpadding="0" class="polarion-JSPreviewPanel-PanelFixed">' +
          '<tbody><tr><td style="padding:0 10px;width:100%;">' +
          '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">' +
          "<tbody><tr>" +
          '<th class="polarion-TableDataHeader" style="width:40%;' +
          thStyle +
          '">Name</th>' +
          '<th class="polarion-TableDataHeader" style="width:50%;' +
          thStyle +
          '">Filter Pattern</th>' +
          '<th class="polarion-TableDataHeader" style="width:80px;' +
          thStyle +
          '">Actions</th>' +
          "</tr>" +
          setsRows +
          "</tbody></table></td></tr></tbody></table>"
        : '<table cellspacing="0" cellpadding="0" class="polarion-JSPreviewPanel-PanelFixed">' +
          '<tbody><tr><td style="padding:6px 10px;color:#888;font-style:italic;">No custom sets defined.</td></tr></tbody></table>';

    // If currently editing a set, show editor inline
    var editorSection = "";
    if (_editingSetId) {
      var editingSet = null;
      if (_editingSetId !== "new") {
        editingSet = null;
        for (var i = 0; i < _customSets.length; i++) {
          if (_customSets[i].id === _editingSetId) {
            editingSet = _customSets[i];
            break;
          }
        }
      }
      editorSection =
        '<div class="polarion-JSPreviewPanelTitleClick" style="margin-top:8px;">' +
        '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody><tr>' +
        '<td class="polarion-JSPreviewPanel-TitleTd">' +
        (_editingSetId === "new"
          ? "New Custom Set"
          : "Edit: " + escHtml(editingSet ? editingSet.name : "")) +
        "</td></tr></tbody></table></div>" +
        buildCustomSetEditorHtml(editingSet);
    }

    return (
      '<div id="_ui_cepi_form_layouter" data-cepi-form="true">' +
      '<div class="GLNRHCCBOBB">' +
      '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody>' +
      "<tr>" +
      '<td class="polarion-NameCell"><span>Plugin:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<img src="/polarion/code-editor/resources/img/code-editor-icon-light.svg" style="width:24px;height:24px;display:block;">' +
      '<span><strong>Code Editor</strong> &nbsp;<tt style="color:#888;font-size:11px;">boesger.polarion.codeeditor</tt></span>' +
      "</div>" +
      "</td></tr>" +
      '<tr><td class="polarion-NameCell"><span>Description:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell">' +
      "The Code Editor plugin extends Polarion with a browser-based file editor." +
      "</td></tr>" +
      '<tr><td class="polarion-NameCell"><span>Applicable&nbsp;permissions:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell">' +
      '<ul style="margin:2px 0 0 0;padding-left:18px;">' +
      permList +
      "</ul>" +
      "</td></tr>" +
      "</tbody></table></div>" +
      // Custom Sets header
      '<div class="polarion-JSPreviewPanelTitleClick">' +
      '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody><tr>' +
      '<td class="polarion-JSPreviewPanel-TitleTd">Custom Permission Sets</td>' +
      '<td style="white-space:nowrap;">' +
      '<span data-cepi-action="set-new" style="cursor:pointer;margin-left:12px;padding:1px 8px;' +
      'border:1px solid #aaa;background:#f5f5f5;border-radius:2px;font-size:11px;" title="Add new set">+ Add Set</span>' +
      "</td></tr></tbody></table></div>" +
      setsTable +
      editorSection +
      "</div>"
    );
  }

  /* ── Permission detail panel (click on child row) ───────────────────── */

  function buildDetailHtml(perm, grants, editMode, p) {
    var base = p.base,
      bid = p.bid;

    // Description fields block
    var fieldsHtml =
      '<div class="GLNRHCCBOBB">' +
      '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody>' +
      "<tr>" +
      '<td class="polarion-NameCell"><span>ID:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell" style="height:auto;">' +
      '<div><tt style="font-weight:normal;">' +
      escHtml(perm.id) +
      "</tt></div>" +
      "</td>" +
      "</tr>" +
      "<tr>" +
      '<td class="polarion-NameCell"><span>Label:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell" style="height:auto;">' +
      "<div>" +
      escHtml(perm.label) +
      "</div>" +
      "</td>" +
      "</tr>" +
      (perm.description
        ? "<tr>" +
          '<td class="polarion-NameCell"><span>Description:</span></td>' +
          '<td class="polarion-SectionLayouterContentCell" style="height:auto;">' +
          "<div>" +
          escHtml(perm.description) +
          "</div>" +
          "</td>" +
          "</tr>"
        : "") +
      "</tbody></table></div>";

    if (ROLES.length === 0) {
      return (
        '<div id="_ui_cepi_form_layouter" data-cepi-form="true">' +
        fieldsHtml +
        '<div class="polarion-JSPreviewPanelTitleClick">' +
        '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody><tr>' +
        '<td class="polarion-JSPreviewPanel-TitleTd">Applicable Roles</td>' +
        "</tr></tbody></table>" +
        "</div>" +
        '<table cellspacing="0" cellpadding="0" class="polarion-JSPreviewPanel-PanelFixed">' +
        '<tbody><tr><td style="padding-left:10px;padding-right:10px;width:100%;">' +
        '<div style="padding:6px 0;color:#888;font-style:italic;">Role definitions not yet loaded. Click any native permission row first.</div>' +
        "</td></tr></tbody></table>" +
        "</div>"
      );
    }

    // Section header – always edit mode, no pencil needed
    var sectionHeader =
      '<div class="polarion-JSPreviewPanelTitleClick">' +
      '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody><tr>' +
      '<td class="polarion-JSPreviewPanel-TitleTd">Applicable Roles</td>' +
      "</tr></tbody></table>" +
      "</div>";

    var tdStyle =
      "white-space:nowrap;border-bottom:1px solid #D2D7DA;padding-left:4px;padding-right:4px;height:32px;vertical-align:middle;";
    var isProjectScope = !!_currentProjectId();
    var globalGrants = _globalGrantedMap[perm.id] || {};
    var roleRows = ROLES.map(function (role) {
      var state = grants[role.name];
      if (state === undefined) state = null;
      var globalState = globalGrants[role.name];
      if (globalState === undefined) globalState = null;
      var grantedTdStyle = tdStyle + "text-align:center;width:50px;";
      var imgSrc = isProjectScope
        ? grantImgProject(p, state, globalState)
        : grantImg(p, state);
      var stateTitle = isProjectScope
        ? grantTitleProject(state, globalState)
        : state === true
          ? "Granted"
          : state === false
            ? "Denied"
            : "Not set – click to cycle";
      var grantedCell =
        '<td class="polarion-TableDataRow" style="' +
        grantedTdStyle +
        '">' +
        '<img src="' +
        imgSrc +
        '"' +
        ' data-cepi-role-toggle="' +
        escHtml(role.name) +
        '"' +
        ' title="' +
        escHtml(stateTitle) +
        '"' +
        ' style="cursor:pointer;vertical-align:middle;">' +
        "</td>";
      return (
        "<tr>" +
        '<td class="polarion-TableDataRow" style="' +
        tdStyle +
        '"><div style="overflow:hidden;">' +
        escHtml(role.name) +
        "</div></td>" +
        '<td class="polarion-TableDataRow" style="' +
        tdStyle +
        '">' +
        escHtml(role.scope) +
        "</td>" +
        grantedCell +
        "</tr>"
      );
    }).join("");

    var thStyle =
      "white-space:nowrap;color:#757575;font-weight:normal;border-bottom:1px solid #d5d6da;height:28px;padding-right:4px;padding-left:4px;vertical-align:middle;text-align:left;";
    var rolesTable =
      '<table cellspacing="0" cellpadding="0" class="polarion-JSPreviewPanel-PanelFixed">' +
      '<tbody><tr><td style="padding-left:10px;padding-right:10px;width:100%;">' +
      '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">' +
      "<tbody><tr>" +
      '<th class="polarion-TableDataHeader" style="width:50%;' +
      thStyle +
      '">Role</th>' +
      '<th class="polarion-TableDataHeader" style="width:50%;' +
      thStyle +
      '">Scope</th>' +
      '<th class="polarion-TableDataHeader" style="width:50px;' +
      thStyle +
      '">Granted</th>' +
      "</tr>" +
      roleRows +
      "</tbody></table>" +
      "</td></tr></tbody></table>";

    return (
      '<div id="_ui_cepi_form_layouter" data-cepi-form="true">' +
      fieldsHtml +
      sectionHeader +
      rolesTable +
      "</div>"
    );
  }

  /* ── Toolbar state helpers ──────────────────────────────────────────── */

  /** Deep-clone the grants map for snapshot/restore. */
  function deepCloneGrants(src) {
    var dst = {};
    if (!src) return dst;
    Object.keys(src).forEach(function (permId) {
      dst[permId] = {};
      if (src[permId]) {
        Object.keys(src[permId]).forEach(function (role) {
          dst[permId][role] = src[permId][role];
        });
      }
    });
    return dst;
  }

  /** Enable or disable the OOTB Save/Cancel buttons based on dirty state.
   *  Polarion marks disabled buttons with color:rgb(201,209,215) on the <table>
   *  and class="polarion-ToolbarButton-IconDisabled" on the icon <img>.
   *  We toggle exactly those two signals so it looks native. */
  function setCepiButtonsDirty(isDirty) {
    _dirty = isDirty;
    document
      .querySelectorAll("table.polarion-ToolbarButton")
      .forEach(function (t) {
        var l = t.querySelector(".polarion-ToolbarButton-Label");
        var text = l ? l.textContent.trim() : "";
        if (text !== "Save" && text !== "Cancel") return;
        var img = t.querySelector("img");
        if (isDirty) {
          t.style.color = "";
          t.style.pointerEvents = "";
          if (img) img.className = "polarion-ToolbarButton-Icon";
        } else {
          t.style.color = "rgb(201, 209, 215)";
          t.style.pointerEvents = "none";
          if (img) img.className = "polarion-ToolbarButton-IconDisabled";
        }
      });
  }

  /** One-time document-level capture handler for all toolbar button clicks.
   *  More robust than per-element hooks since GWT recreates DOM nodes freely.
   *  Intercepts Save, Cancel, and Refresh while cepi is active. */
  var _docToolbarHookInstalled = false;
  function initDocumentLevelToolbarHook() {
    if (_docToolbarHookInstalled) return;
    _docToolbarHookInstalled = true;
    document.addEventListener(
      "click",
      function (e) {
        // Walk up to find the toolbar button <table>
        var t = e.target;
        while (t && t !== document.body) {
          if (
            t.tagName === "TABLE" &&
            t.classList &&
            t.classList.contains("polarion-ToolbarButton")
          )
            break;
          t = t.parentElement;
        }
        if (
          !t ||
          !t.classList ||
          !t.classList.contains("polarion-ToolbarButton")
        )
          return;
        if (!_cepiActive) return; // only intercept when cepi row is selected

        var l = t.querySelector(".polarion-ToolbarButton-Label");
        var text = l ? l.textContent.trim() : "";
        var isRefresh = !!t.querySelector('img[src*="refreshBtn"]');

        if (text === "Save") {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (!_dirty) return;
          _pushGrantsToBackend();
          try {
            localStorage.setItem(
              _grantsStorageKey(),
              JSON.stringify(_grantedMap),
            );
          } catch (ex) {}
          _savedSnapshot = deepCloneGrants(_grantedMap);
          setCepiButtonsDirty(false);
        } else if (text === "Cancel") {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (!_dirty) return;
          _grantedMap = deepCloneGrants(_savedSnapshot);
          try {
            localStorage.setItem(
              _grantsStorageKey(),
              JSON.stringify(_grantedMap),
            );
          } catch (ex) {}
          setCepiButtonsDirty(false);
          if (_activePermId) renderDetailPanel();
        } else if (isRefresh) {
          // Intercept Refresh: hard reload from backend – discard any stale in-memory / localStorage state
          e.stopImmediatePropagation();
          e.preventDefault();
          try {
            localStorage.removeItem(_grantsStorageKey());
          } catch (ex) {}
          loadGrants(); // fetches permissions.xml fresh, then re-renders panel
        }
      },
      true,
    ); // capture phase – runs before GWT onclick handlers
  }

  /** Enter cepi mode: hide Edit, show Save/Cancel in correct dirty/clean state. */
  function cepiEnterMode() {
    _cepiActive = true;
    document
      .querySelectorAll("table.polarion-ToolbarButton")
      .forEach(function (t) {
        var l = t.querySelector(".polarion-ToolbarButton-Label");
        var text = l ? l.textContent.trim() : "";
        if (text === "Edit") {
          t.style.display = "none";
        } else if (text === "Save" || text === "Cancel") {
          t.style.display = "";
        }
      });
    setCepiButtonsDirty(_dirty);
  }

  /** Leave cepi mode: restore all toolbar buttons to native state. */
  function cepiLeaveMode() {
    _cepiActive = false;
    _dirty = false;
    document
      .querySelectorAll("table.polarion-ToolbarButton")
      .forEach(function (t) {
        var l = t.querySelector(".polarion-ToolbarButton-Label");
        var text = l ? l.textContent.trim() : "";
        if (text === "Edit" || text === "Save" || text === "Cancel") {
          t.style.display = "";
          t.style.color = "";
          t.style.pointerEvents = "";
          var img = t.querySelector("img");
          if (img) img.className = "polarion-ToolbarButton-Icon";
        }
      });
  }

  /* ── Native toolbar hooks ────────────────────────────────────────────── */

  function setupToolbarHooks() {
    // One-time document-level hook for Save/Cancel/Refresh toolbar buttons
    initDocumentLevelToolbarHook();
    // Deselect cepi when user clicks any OOTB row
    var tableContainer =
      document.querySelector(
        ".polarion-JSTreeTable-TableContainer, .polarion-JSTreeTable",
      ) || document.body;
    if (tableContainer && !tableContainer._cepiClickHooked) {
      tableContainer._cepiClickHooked = true;
      tableContainer.addEventListener(
        "click",
        function (e) {
          var target = e.target;
          while (target && target !== tableContainer) {
            if (
              target.classList &&
              target.classList.contains("JSTreeTableRow") &&
              !target.getAttribute("data-cepi-parent") &&
              !target.getAttribute("data-cepi-child")
            ) {
              deselectAll();
              _activePermId = null;
              cepiLeaveMode();
              return;
            }
            target = target.parentElement;
          }
        },
        true,
      );
    }
  }

  /* ── Panel rendering ────────────────────────────────────────────────── */

  function renderDetailPanel() {
    var container = document.querySelector(
      ".polarion-PreviewForm-ContentContainer",
    );
    if (!container) return;
    var content = container.querySelector(".polarion-PreviewForm-Content");
    if (!content) content = container;

    var perm = null;
    for (var i = 0; i < PERMISSIONS.length; i++) {
      if (PERMISSIONS[i].id === _activePermId) {
        perm = PERMISSIONS[i];
        break;
      }
    }
    if (!perm) return;

    var p = imgPaths();
    // Always in edit mode: use _grantedMap directly (no separate buffer)
    var grants = _grantedMap[perm.id] || {};
    content.innerHTML = buildDetailHtml(perm, grants, true, p);

    // Image toggle handlers – always active, auto-save on each click
    var isProjectScopeHandler = !!_currentProjectId();
    content.querySelectorAll("[data-cepi-role-toggle]").forEach(function (img) {
      var role = img.getAttribute("data-cepi-role-toggle");
      img.addEventListener(
        "click",
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (!_grantedMap[perm.id]) _grantedMap[perm.id] = {};
          _grantedMap[perm.id][role] = cycleGrant(_grantedMap[perm.id][role]);
          var newState = _grantedMap[perm.id][role];
          var globalState = isProjectScopeHandler
            ? (_globalGrantedMap[perm.id] || {})[role] !== undefined
              ? (_globalGrantedMap[perm.id] || {})[role]
              : null
            : null;
          img.src = isProjectScopeHandler
            ? grantImgProject(p, newState, globalState)
            : grantImg(p, newState);
          img.title = isProjectScopeHandler
            ? grantTitleProject(newState, globalState)
            : newState === true
              ? "Granted"
              : newState === false
                ? "Denied"
                : "Not set – click to cycle";
          saveGrants();
        },
        true,
      );
    });
  }

  function showDetailPanel(permId) {
    _activePermId = permId;
    renderDetailPanel();
    cepiEnterMode();
  }

  function showGroupDetailPanel() {
    _activePermId = null;
    var container = document.querySelector(
      ".polarion-PreviewForm-ContentContainer",
    );
    if (!container) return;
    var content = container.querySelector(".polarion-PreviewForm-Content");
    if (!content) content = container;
    content.innerHTML = buildGroupDetailHtml(imgPaths());
    _attachGroupPanelHandlers(content);
  }

  function _attachGroupPanelHandlers(content) {
    // Add new set
    var addBtn = content.querySelector('[data-cepi-action="set-new"]');
    if (addBtn) {
      addBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        _editingSetId = "new";
        _setEditBuffer = { name: "", filter: "" };
        // Init grant buffer for new set
        PERMISSIONS.forEach(function (perm) {
          _setEditBuffer[perm.id] = {};
          ROLES.forEach(function (role) {
            _setEditBuffer[perm.id][role.name] = null;
          });
        });
        showGroupDetailPanel();
      });
    }

    // Edit existing set
    content
      .querySelectorAll('[data-cepi-action="set-edit"]')
      .forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var id = btn.getAttribute("data-cepi-set-id");
          var set = null;
          for (var i = 0; i < _customSets.length; i++) {
            if (_customSets[i].id === id) {
              set = _customSets[i];
              break;
            }
          }
          if (!set) return;
          _editingSetId = id;
          _setEditBuffer = { name: set.name, filter: set.filter };
          PERMISSIONS.forEach(function (perm) {
            _setEditBuffer[perm.id] = {};
            ROLES.forEach(function (role) {
              var v =
                set.grants && set.grants[perm.id]
                  ? set.grants[perm.id][role.name]
                  : null;
              _setEditBuffer[perm.id][role.name] = v === undefined ? null : v;
            });
          });
          showGroupDetailPanel();
        });
      });

    // Delete set
    content
      .querySelectorAll('[data-cepi-action="set-delete"]')
      .forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var id = btn.getAttribute("data-cepi-set-id");
          _customSets = _customSets.filter(function (s) {
            return s.id !== id;
          });
          saveCustomSets();
          _editingSetId = null;
          showGroupDetailPanel();
        });
      });

    // Set-editor: role grant toggles
    content.querySelectorAll("[data-cepi-set-toggle]").forEach(function (img) {
      var key = img.getAttribute("data-cepi-set-toggle"); // "permId:roleName"
      var parts = key.split(":");
      var permId = parts[0],
        roleName = parts.slice(1).join(":");
      img.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!_setEditBuffer[permId]) _setEditBuffer[permId] = {};
        _setEditBuffer[permId][roleName] = cycleGrant(
          _setEditBuffer[permId][roleName],
        );
        var p = imgPaths();
        img.src = grantImg(p, _setEditBuffer[permId][roleName]);
      });
    });

    // Save set
    var setsSaveBtn = content.querySelector('[data-cepi-action="set-save"]');
    if (setsSaveBtn) {
      setsSaveBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var nameInp = content.querySelector("[data-cepi-set-name]");
        var filterInp = content.querySelector("[data-cepi-set-filter]");
        var name = nameInp ? nameInp.value.trim() : "";
        var filter = filterInp ? filterInp.value.trim() : "";
        if (!name) {
          alert("Please enter a set name.");
          return;
        }
        var grants = {};
        PERMISSIONS.forEach(function (perm) {
          grants[perm.id] = {};
          ROLES.forEach(function (role) {
            var v = _setEditBuffer[perm.id]
              ? _setEditBuffer[perm.id][role.name]
              : null;
            grants[perm.id][role.name] = v === undefined ? null : v;
          });
        });
        if (_editingSetId === "new") {
          _customSets.push({
            id: genId(),
            name: name,
            filter: filter,
            grants: grants,
          });
        } else {
          for (var i = 0; i < _customSets.length; i++) {
            if (_customSets[i].id === _editingSetId) {
              _customSets[i].name = name;
              _customSets[i].filter = filter;
              _customSets[i].grants = grants;
              break;
            }
          }
        }
        saveCustomSets();
        _editingSetId = null;
        showGroupDetailPanel();
      });
    }

    // Cancel set editing
    var setsCancelBtn = content.querySelector(
      '[data-cepi-action="set-cancel"]',
    );
    if (setsCancelBtn) {
      setsCancelBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        _editingSetId = null;
        showGroupDetailPanel();
      });
    }
  }

  /* ── Selection helpers ──────────────────────────────────────────────── */

  function deselectOotb() {
    document
      .querySelectorAll(
        ".JSTreeTableRow.selected:not([data-cepi-parent]):not([data-cepi-child])",
      )
      .forEach(function (r) {
        r.classList.remove("selected");
      });
  }

  function deselectAll() {
    document
      .querySelectorAll("[data-cepi-parent],[data-cepi-child]")
      .forEach(function (r) {
        r.removeAttribute("data-cepi-selected");
        r.style.background = "";
      });
  }

  /* ── Keep cepi rows at end of table (fix OOTB expand-under-cepi bug) ─ */

  function _ensureCepiAtEnd() {
    var cepiParent = document.querySelector("[data-cepi-parent]");
    if (!cepiParent) return;
    var next = cepiParent.nextSibling;
    var hasOotbAfter = false;
    while (next) {
      if (
        next.nodeType === 1 &&
        next.getAttribute &&
        !next.getAttribute("data-cepi-parent") &&
        !next.getAttribute("data-cepi-child") &&
        next.classList &&
        next.classList.contains("JSTreeTableRow")
      ) {
        hasOotbAfter = true;
        break;
      }
      next = next.nextSibling;
    }
    if (!hasOotbAfter) return;
    // Move all cepi rows to after the last OOTB row
    var allRows = Array.from(cepiParent.parentNode.children);
    var lastOotb = null;
    for (var i = allRows.length - 1; i >= 0; i--) {
      var r = allRows[i];
      if (
        r.classList &&
        r.classList.contains("JSTreeTableRow") &&
        !r.getAttribute("data-cepi-parent") &&
        !r.getAttribute("data-cepi-child")
      ) {
        lastOotb = r;
        break;
      }
    }
    if (!lastOotb) return;
    var cepiRows = Array.from(
      cepiParent.parentNode.querySelectorAll(
        "[data-cepi-parent],[data-cepi-child]",
      ),
    );
    cepiRows.forEach(function (r) {
      r.remove();
    });
    var ref = lastOotb;
    cepiRows.forEach(function (r) {
      ref.insertAdjacentElement("afterend", r);
      ref = r;
    });
    console.info("[cepi] Repositioned cepi rows after last OOTB row");
  }

  /* ── Main injection ─────────────────────────────────────────────────── */

  function inject() {
    if (isInjected()) return;
    if (!isTargetPage()) return;

    var lastNative = getContainer();
    if (!lastNative) return;

    document
      .querySelectorAll("[data-cepi-parent],[data-cepi-child]")
      .forEach(function (r) {
        r.remove();
      });

    var p = imgPaths();
    var base = p.base,
      bid = p.bid;
    var w = labelColWidth();

    /* ── Parent row ── */
    var parentRow = document.createElement("div");
    parentRow.className = "JSTreeTableRow fixed";
    parentRow.setAttribute("data-cepi-parent", "true");
    parentRow.style.cursor = "pointer";
    parentRow.innerHTML = parentLabelHtml(base, bid, w);

    parentRow.addEventListener("mouseover", function () {
      if (parentRow.getAttribute("data-cepi-selected") !== "true") {
        parentRow.style.background = "#CDE6EB";
      }
    });
    parentRow.addEventListener("mouseout", function () {
      if (parentRow.getAttribute("data-cepi-selected") !== "true") {
        parentRow.style.background = "";
      }
    });

    // Pfeil-Icon → Toggle; Rest → Gruppen-Detailpanel
    parentRow.addEventListener(
      "click",
      function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (
          e.target &&
          e.target.getAttribute &&
          e.target.getAttribute("data-cepi-icon") === "toggle"
        ) {
          _expanded = !_expanded;
          applyToggle(parentRow);
        } else {
          deselectAll();
          parentRow.setAttribute("data-cepi-selected", "true");
          parentRow.style.background = "#CDE6EB";
          showGroupDetailPanel();
          cepiEnterMode();
          setTimeout(deselectOotb, 100);
        }
      },
      true,
    );

    /* ── Child rows ── */
    var children = PERMISSIONS.map(function (perm, idx) {
      var isLast = idx === PERMISSIONS.length - 1;
      var row = document.createElement("div");
      row.className = "JSTreeTableRow fixed";
      row.setAttribute("data-cepi-child", "true");
      row.setAttribute("data-cepi-pid", perm.id);
      row.style.display = "none";
      row.style.cursor = "pointer";
      row.innerHTML = childLabelHtml(perm, isLast, base, bid, w);

      row.addEventListener("mouseover", function () {
        if (row.getAttribute("data-cepi-selected") !== "true") {
          row.style.background = "#CDE6EB";
        }
      });
      row.addEventListener("mouseout", function () {
        if (row.getAttribute("data-cepi-selected") !== "true") {
          row.style.background = "";
        }
      });
      row.addEventListener(
        "click",
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          deselectAll();
          row.setAttribute("data-cepi-selected", "true");
          row.style.background = "#CDE6EB";
          showDetailPanel(perm.id);
          setTimeout(deselectOotb, 100);
        },
        true,
      );

      return row;
    });

    /* ── Insert into DOM ── */
    lastNative.insertAdjacentElement("afterend", parentRow);
    var prev = parentRow;
    children.forEach(function (r) {
      prev.insertAdjacentElement("afterend", r);
      prev = r;
    });

    console.info(
      "[cepi] Code Editor group injected after",
      lastNative.textContent.trim().slice(0, 30),
    );

    tryAddRoleCells();
    tryExtractRoles();
    setupToolbarHooks();
  }

  /* ── Bootstrap ──────────────────────────────────────────────────────── */

  loadGrants();
  loadCustomSets();
  inject();

  var _scheduledInject = false;
  new MutationObserver(function () {
    if (_scheduledInject) return;
    _scheduledInject = true;
    requestAnimationFrame(function () {
      _scheduledInject = false;

      // If the user navigated away from the Permissions page, reset active
      // state so stale panel-renders and row-highlights don't bleed into
      // other admin views (Projects, Users, Groups, …) that share the same
      // JSTreeTable structure.
      if (!isTargetPage()) {
        if (_cepiActive || _activePermId !== null) {
          _cepiActive = false;
          _activePermId = null;
        }
        return;
      }

      // ── Context-change detection: clear stale state when scope switches ──
      var _currentCtx = _currentProjectId();
      if (_lastKnownProjectId !== undefined && _lastKnownProjectId !== _currentCtx) {
        // Scope changed (e.g. global → project or project A → project B).
        // Reset all grant state so we never show the previous scope's values.
        _grantedMap = {};
        _globalGrantedMap = {};
        ROLES = [];
        _roleDone = false;
        _dirty = false;
        _savedSnapshot = null;
        _activePermId = null;
        _cepiActive = false;
        loadGrants(); // fresh fetch for the new scope
      }
      _lastKnownProjectId = _currentCtx;

      if (!isInjected()) {
        _expanded = false;
        _roleDone = false;
        inject();
      } else {
        tryAddRoleCells();
        _ensureCepiAtEnd();
      }
      if (ROLES.length === 0) {
        if (tryExtractRoles() && _activePermId) {
          renderDetailPanel();
        }
      }
      // If native Polarion panel appeared, deselect cepi rows and clear active perm.
      // We use a flag: _cepiPanelActive is true when we intentionally showed our panel.
      // If Polarion replaces our panel (mutation fires, _cepiPanelActive still true but panel content changed),
      // clear cepi selection.
      // Simple heuristic: if a cepi row is selected but _activePermId is null, we're in transition.
      // Instead: clear cepi selection only when Polarion shows its native panel for a non-cepi entity.
      var hasCepiSelected = !!document.querySelector(
        '[data-cepi-parent][data-cepi-selected="true"],[data-cepi-child][data-cepi-selected="true"]',
      );
      if (hasCepiSelected && _activePermId === null) {
        deselectAll();
      }
      // If cepi was active but something (SPA navigation, GWT repaint) replaced our panel,
      // restore it immediately from in-memory state (no backend fetch needed here –
      // Refresh is intercepted at the click level and calls loadGrants() itself).
      if (_cepiActive && _activePermId) {
        var panelContent = document.querySelector(
          ".polarion-PreviewForm-Content",
        );
        if (panelContent && !panelContent.querySelector("[data-cepi-form]")) {
          renderDetailPanel();
          cepiEnterMode();
        }
      }
      // Re-apply row highlight for active cepi selection after DOM mutations
      if (_activePermId) {
        var activeRow = document.querySelector(
          '[data-cepi-pid="' + _activePermId + '"]',
        );
        if (
          activeRow &&
          activeRow.getAttribute("data-cepi-selected") !== "true"
        ) {
          activeRow.setAttribute("data-cepi-selected", "true");
          activeRow.style.background = "#CDE6EB";
        }
      }
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
// ── END OF FILE ─────────────────────────────────────────────────────────────
