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
  var _grantedMap = {};
  var _activePermId = null;
  var _editMode = false;
  var _editBuffer = {};

  /* ── DOM helpers ────────────────────────────────────────────────────── */

  function isTargetPage() {
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
    var file = base + "topicIconsSmallDark/project.png" + bid;
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
      '<img style="vertical-align:middle;border:0px;margin-right:2px;" src="' +
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
            if (_grantedMap[perm.id][role.name] === undefined) {
              _grantedMap[perm.id][role.name] = false;
            }
          });
        });
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

  function loadGrants() {
    try {
      var stored = localStorage.getItem("cepi-grants");
      if (stored) _grantedMap = JSON.parse(stored);
    } catch (e) {}
    PERMISSIONS.forEach(function (perm) {
      if (!_grantedMap[perm.id]) _grantedMap[perm.id] = {};
      ROLES.forEach(function (role) {
        if (_grantedMap[perm.id][role.name] === undefined) {
          _grantedMap[perm.id][role.name] = false;
        }
      });
    });
  }

  function saveGrants() {
    try {
      localStorage.setItem("cepi-grants", JSON.stringify(_grantedMap));
    } catch (e) {}
  }

  /* ── Group detail panel (click on "Code Editor" row body) ───────────── */

  function buildGroupDetailHtml(p) {
    var permItems = PERMISSIONS.map(function (perm) {
      return (
        '<div style="padding:12px 0;border-bottom:1px solid #f0f1f5;">' +
        '<div style="display:inline-block;padding:2px 8px;border-radius:4px;' +
        "background:#ddf0f3;color:#0b7a8a;font-size:11px;font-family:monospace;" +
        'margin-bottom:5px;">' +
        escHtml(perm.id) +
        "</div>" +
        '<div style="font-weight:600;color:#222;margin-bottom:3px;">' +
        escHtml(perm.label) +
        "</div>" +
        '<div style="color:#666;font-size:12px;line-height:1.45;">' +
        escHtml(perm.description || "") +
        "</div>" +
        "</div>"
      );
    }).join("");

    return (
      '<div id="_ui_cepi_form_layouter" style="font-family:\'Segoe UI\',Open Sans,Arial,sans-serif;font-size:13px;color:#333;">' +
      // Header
      '<div style="padding:16px 20px 14px;border-bottom:1px solid #ecedf2;display:flex;align-items:center;gap:12px;">' +
      '<div style="width:36px;height:36px;border-radius:8px;background:#CDE6EB;' +
      'display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
      '<img src="' +
      p.base +
      "topicIconsSmallDark/project.png" +
      p.bid +
      '" style="display:block;">' +
      "</div>" +
      "<div>" +
      '<div style="font-weight:700;font-size:15px;color:#1a1a1a;line-height:1.2;">Code Editor</div>' +
      '<div style="color:#888;font-size:11.5px;margin-top:3px;font-family:monospace;">boesger.polarion.codeeditor</div>' +
      "</div>" +
      "</div>" +
      // Description
      '<div style="padding:12px 20px;border-bottom:1px solid #ecedf2;color:#555;font-size:12.5px;line-height:1.55;">' +
      "The Code Editor plugin extends Polarion with a browser-based file editor. " +
      "The permissions below control who can read and write files within the editor." +
      "</div>" +
      // Section header
      '<div style="display:flex;align-items:center;padding:9px 20px 8px;background:#f5f6fa;border-bottom:1px solid #ecedf2;">' +
      '<span style="font-weight:700;color:#1a73e8;font-size:13px;letter-spacing:.01em;">' +
      "Permissions (" +
      PERMISSIONS.length +
      ")" +
      "</span>" +
      "</div>" +
      // Permissions list
      '<div style="padding:0 20px 8px;">' +
      permItems +
      "</div>" +
      "</div>"
    );
  }

  /* ── Permission detail panel (click on child row) ───────────────────── */

  function buildDetailHtml(perm, grants, editMode, p) {
    var base = p.base,
      bid = p.bid;

    if (ROLES.length === 0) {
      return (
        '<div id="_ui_cepi_form_layouter" style="font-family:\'Segoe UI\',Open Sans,Arial,sans-serif;font-size:13px;color:#333;">' +
        '<div style="padding:16px 20px 14px;border-bottom:1px solid #ecedf2;">' +
        '<div style="margin-bottom:6px;">' +
        '<span style="color:#999;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">ID</span><br>' +
        '<span style="font-weight:600;font-size:12.5px;">' +
        escHtml(perm.id) +
        "</span>" +
        "</div>" +
        "<div>" +
        '<span style="color:#999;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Label</span><br>' +
        '<span style="font-weight:600;font-size:12.5px;">' +
        escHtml(perm.label) +
        "</span>" +
        "</div>" +
        "</div>" +
        '<div data-cepi-placeholder="true" style="margin:14px 20px;padding:12px 14px;background:#f5f7fa;border-radius:6px;border-left:3px solid #c0c8d4;color:#777;font-style:italic;font-size:12px;">' +
        "Role definitions not yet loaded. Please click any other permission in the list once so Polarion can provide the role configuration." +
        "</div>" +
        "</div>"
      );
    }

    var editImg = base + "portlet/portletEdit.png" + bid;
    var checkedImg = base + "columns_checked.gif" + bid;
    var chkYesImg = base + "checkbox/yes.png" + bid;
    var chkNoImg = base + "checkbox/no.png" + bid;

    var headerActions;
    if (editMode) {
      headerActions =
        '<div style="display:flex;gap:6px;">' +
        '<button data-cepi-action="save" style="' +
        "cursor:pointer;border:none;border-radius:4px;padding:4px 14px;" +
        "background:#1a73e8;color:#fff;font-size:12px;font-weight:600;" +
        "font-family:inherit;letter-spacing:.02em;" +
        '">Save</button>' +
        '<button data-cepi-action="cancel" style="' +
        "cursor:pointer;border:1px solid #d0d5dd;border-radius:4px;padding:4px 14px;" +
        "background:#fff;color:#555;font-size:12px;font-weight:500;font-family:inherit;" +
        '">Cancel</button>' +
        "</div>";
    } else {
      headerActions =
        '<span data-cepi-action="edit" style="cursor:pointer;line-height:0;">' +
        '<img src="' +
        editImg +
        '" title="Edit"' +
        ' style="vertical-align:middle;opacity:.65;transition:opacity .15s;"' +
        ' onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.65">' +
        "</span>";
    }

    var roleRows = ROLES.map(function (role) {
      var grantedCell;
      if (editMode) {
        var imgSrc = grants[role.name] ? chkYesImg : chkNoImg;
        grantedCell =
          '<td style="padding:0 12px;vertical-align:middle;text-align:center;">' +
          '<img src="' +
          imgSrc +
          '" data-cepi-role-toggle="' +
          escHtml(role.name) +
          '"' +
          ' style="cursor:pointer;vertical-align:middle;display:block;margin:auto;">' +
          "</td>";
      } else {
        grantedCell =
          '<td style="padding:0 12px;vertical-align:middle;text-align:center;">' +
          (grants[role.name]
            ? '<img src="' +
              checkedImg +
              '" title="Granted" style="display:block;margin:auto;">'
            : "") +
          "</td>";
      }
      var scopeBadgeColor = role.scope === "Global" ? "#0057b7" : "#2e7d32";
      var scopeBadgeBg = role.scope === "Global" ? "#e8f0fe" : "#e8f5e9";
      var scopeBadge =
        '<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;' +
        "color:" +
        scopeBadgeColor +
        ";background:" +
        scopeBadgeBg +
        ";letter-spacing:.02em;" +
        '">' +
        escHtml(role.scope) +
        "</span>";
      return (
        '<tr style="border-bottom:1px solid #f0f1f5;"' +
        " onmouseover=\"this.style.background='#f0f4ff'\" onmouseout=\"this.style.background=''\">" +
        '<td style="padding:0 12px;height:34px;vertical-align:middle;font-weight:500;">' +
        escHtml(role.name) +
        "</td>" +
        '<td style="padding:0 12px;vertical-align:middle;">' +
        scopeBadge +
        "</td>" +
        grantedCell +
        "</tr>"
      );
    }).join("");

    var descRow = perm.description
      ? '<div style="margin-top:8px;">' +
        '<span style="color:#999;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Description</span><br>' +
        '<span style="color:#555;font-size:12px;line-height:1.45;">' +
        escHtml(perm.description) +
        "</span>" +
        "</div>"
      : "";

    return (
      '<div id="_ui_cepi_form_layouter" style="font-family:\'Segoe UI\',Open Sans,Arial,sans-serif;font-size:13px;color:#333;">' +
      // Meta section
      '<div style="padding:16px 20px 14px;border-bottom:1px solid #ecedf2;">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;">' +
      "<div>" +
      '<span style="color:#999;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">ID</span><br>' +
      '<span style="font-weight:600;font-size:12.5px;">' +
      escHtml(perm.id) +
      "</span>" +
      "</div>" +
      "<div>" +
      '<span style="color:#999;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Label</span><br>' +
      '<span style="font-weight:600;font-size:12.5px;">' +
      escHtml(perm.label) +
      "</span>" +
      "</div>" +
      "</div>" +
      descRow +
      "</div>" +
      // Section header
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 20px 8px;background:#f5f6fa;border-bottom:1px solid #ecedf2;">' +
      '<span style="font-weight:700;color:#1a73e8;font-size:13px;letter-spacing:.01em;">Applicable Roles</span>' +
      headerActions +
      "</div>" +
      // Roles table
      '<div style="padding:0 12px 12px;">' +
      '<table style="width:100%;border-collapse:collapse;">' +
      "<thead><tr>" +
      '<th style="text-align:left;padding:8px 12px;color:#888;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #ecedf2;">Role</th>' +
      '<th style="text-align:left;padding:8px 12px;color:#888;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #ecedf2;">Scope</th>' +
      '<th style="text-align:center;padding:8px 12px;color:#888;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #ecedf2;width:72px;">Granted</th>' +
      "</tr></thead>" +
      "<tbody>" +
      roleRows +
      "</tbody>" +
      "</table>" +
      "</div>" +
      "</div>"
    );
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
    var grants = _editMode ? _editBuffer : _grantedMap[perm.id] || {};
    content.innerHTML = buildDetailHtml(perm, grants, _editMode, p);

    // Image toggle handlers (edit mode)
    if (_editMode) {
      content
        .querySelectorAll("[data-cepi-role-toggle]")
        .forEach(function (img) {
          var role = img.getAttribute("data-cepi-role-toggle");
          img.addEventListener(
            "click",
            function (e) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              _editBuffer[role] = !_editBuffer[role];
              img.src = _editBuffer[role]
                ? p.base + "checkbox/yes.png" + p.bid
                : p.base + "checkbox/no.png" + p.bid;
            },
            true,
          );
        });
    }

    var editBtn = content.querySelector('[data-cepi-action="edit"]');
    if (editBtn) {
      editBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        _editBuffer = {};
        var src = _grantedMap[perm.id] || {};
        ROLES.forEach(function (r) {
          _editBuffer[r.name] = !!src[r.name];
        });
        _editMode = true;
        renderDetailPanel();
      });
    }

    var saveBtn = content.querySelector('[data-cepi-action="save"]');
    if (saveBtn) {
      saveBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        _grantedMap[perm.id] = {};
        for (var k in _editBuffer) {
          if (Object.prototype.hasOwnProperty.call(_editBuffer, k)) {
            _grantedMap[perm.id][k] = _editBuffer[k];
          }
        }
        saveGrants();
        _editMode = false;
        renderDetailPanel();
      });
    }

    var cancelBtn = content.querySelector('[data-cepi-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        _editMode = false;
        renderDetailPanel();
      });
    }
  }

  function showDetailPanel(permId) {
    _activePermId = permId;
    _editMode = false;
    renderDetailPanel();
  }

  function showGroupDetailPanel() {
    _activePermId = null;
    _editMode = false;
    var container = document.querySelector(
      ".polarion-PreviewForm-ContentContainer",
    );
    if (!container) return;
    var content = container.querySelector(".polarion-PreviewForm-Content");
    if (!content) content = container;
    content.innerHTML = buildGroupDetailHtml(imgPaths());
  }

  /* ── Selection helpers ──────────────────────────────────────────────── */

  function deselectAll() {
    document
      .querySelectorAll("[data-cepi-parent],[data-cepi-child]")
      .forEach(function (r) {
        r.removeAttribute("data-cepi-selected");
        r.style.background = "";
      });
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
          parentRow.style.background = "#9ECBD2";
          showGroupDetailPanel();
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
          row.style.background = "#9ECBD2";
          showDetailPanel(perm.id);
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
  }

  /* ── Bootstrap ──────────────────────────────────────────────────────── */

  loadGrants();
  inject();

  var _scheduledInject = false;
  new MutationObserver(function () {
    if (_scheduledInject) return;
    _scheduledInject = true;
    requestAnimationFrame(function () {
      _scheduledInject = false;
      if (!isInjected()) {
        _expanded = false;
        _roleDone = false;
        inject();
      } else {
        tryAddRoleCells();
      }
      if (ROLES.length === 0) {
        if (tryExtractRoles() && _activePermId) {
          renderDetailPanel();
        }
      }
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
// ── END OF FILE ─────────────────────────────────────────────────────────────
