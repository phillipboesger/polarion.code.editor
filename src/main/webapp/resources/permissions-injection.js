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
    var permList = PERMISSIONS.map(function (perm) {
      return (
        "<li style='margin-bottom:8px;'>" +
        "<tt>" + escHtml(perm.id) + "</tt> &ndash; <strong>" + escHtml(perm.label) + "</strong>" +
        "<br><span style='color:#555;'>" + escHtml(perm.description || "") + "</span>" +
        "</li>"
      );
    }).join("");

    return (
      '<div id="_ui_cepi_form_layouter">' +
      '<div class="GLNRHCCBACB">' +
      '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody>' +

      // Plugin name row
      "<tr>" +
      '<td class="polarion-NameCell"><span>Plugin:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<img src="/polarion/code-editor/resources/img/code-editor-icon-light.svg" style="width:24px;height:24px;display:block;">' +
      '<span><strong>Code Editor</strong> &nbsp;<tt style="color:#888;font-size:11px;">boesger.polarion.codeeditor</tt></span>' +
      '</div>' +
      '</td></tr>' +

      // Description row
      '<tr><td class="polarion-NameCell"><span>Description:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell">' +
      'The Code Editor plugin extends Polarion with a browser-based file editor.' +
      '</td></tr>' +

      // Permissions row
      '<tr><td class="polarion-NameCell"><span>Applicable&nbsp;permissions:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell">' +
      '<ul style="margin:2px 0 0 0;padding-left:18px;">' + permList + '</ul>' +
      '</td></tr>' +

      '</tbody></table>' +
      '</div>' +
      '</div>'
    );
  }

  /* ── Permission detail panel (click on child row) ───────────────────── */

  function buildDetailHtml(perm, grants, editMode, p) {
    var base = p.base, bid = p.bid;
    var checkedImg = base + "columns_checked.gif" + bid;
    var chkYesImg  = base + "checkbox/yes.png" + bid;
    var chkNoImg   = base + "checkbox/no.png" + bid;

    // Description fields block (matches Polarion field rows: ID / Label / Description)
    var fieldsHtml =
      '<div class="GLNRHCCBACB">' +
      '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody>' +
      '<tr>' +
        '<td class="polarion-NameCell"><span>ID:</span></td>' +
        '<td class="polarion-SectionLayouterContentCell" style="height:auto;">' +
          '<div><tt style="font-weight:normal;">' + escHtml(perm.id) + '</tt></div>' +
        '</td>' +
      '</tr>' +
      '<tr>' +
        '<td class="polarion-NameCell"><span>Label:</span></td>' +
        '<td class="polarion-SectionLayouterContentCell" style="height:auto;">' +
          '<div>' + escHtml(perm.label) + '</div>' +
        '</td>' +
      '</tr>' +
      (perm.description
        ? '<tr>' +
          '<td class="polarion-NameCell"><span>Description:</span></td>' +
          '<td class="polarion-SectionLayouterContentCell" style="height:auto;">' +
            '<div>' + escHtml(perm.description) + '</div>' +
          '</td>' +
          '</tr>'
        : '') +
      '</tbody></table></div>';

    if (ROLES.length === 0) {
      return (
        '<div id="_ui_cepi_form_layouter">' +
        fieldsHtml +
        '<div style="background:#eaf0f6;padding:4px 6px;border-top:1px solid #c8d7e5;border-bottom:1px solid #c8d7e5;display:flex;align-items:center;">' +
        '<span style="font-weight:bold;color:#336699;font-size:13px;">Applicable Roles</span>' +
        '</div>' +
        '<div style="padding:8px 6px;color:#888;font-style:italic;font-weight:normal;">Role definitions not yet loaded. Click any native permission row first.</div>' +
        '</div>'
      );
    }

    // Section header – always just the pencil icon (like OOTB Polarion)
    var sectionHeaderRight =
      '<span data-cepi-action="edit" style="cursor:pointer;padding:0 4px 0 6px;">' +
      '<img src="' + base + 'portlet/portletEdit.png' + bid + '" title="Edit"' +
      ' style="vertical-align:middle;opacity:.6;"' +
      ' onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6">' +
      '</span>';

    var sectionHeader =
      '<div style="background:#eaf0f6;padding:4px 6px;border-top:1px solid #c8d7e5;border-bottom:1px solid #c8d7e5;display:flex;align-items:center;justify-content:space-between;">' +
      '<span style="font-weight:bold;color:#336699;font-size:13px;">Applicable Roles</span>' +
      sectionHeaderRight +
      '</div>';

    // Full-width roles table (outside polarion-SectionLayouterContentCell)
    var roleRows = ROLES.map(function (role) {
      var grantedCell;
      if (editMode) {
        var imgSrc = grants[role.name] ? chkYesImg : chkNoImg;
        grantedCell =
          '<td style="padding:4px 6px;text-align:right;vertical-align:middle;width:80px;">' +
          '<img src="' + imgSrc + '" data-cepi-role-toggle="' + escHtml(role.name) + '"' +
          ' style="cursor:pointer;display:block;margin:auto;">' +
          '</td>';
      } else {
        grantedCell =
          '<td style="padding:4px 6px;text-align:right;vertical-align:middle;width:80px;">' +
          (grants[role.name] ? '<img src="' + checkedImg + '" title="Granted" style="display:block;margin:auto;">' : '') +
          '</td>';
      }
      return (
        '<tr style="border-bottom:1px solid #e8ecf0;" onmouseover="this.style.background=\'#CDE6EB\'" onmouseout="this.style.background=\'\'">' +
        '<td style="padding:4px 6px;vertical-align:middle;">' + escHtml(role.name) + '</td>' +
        '<td style="padding:4px 6px;vertical-align:middle;color:#555;">' + escHtml(role.scope) + '</td>' +
        grantedCell +
        '</tr>'
      );
    }).join('');

    var rolesTable =
      '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">' +
      '<thead><tr style="border-bottom:2px solid #c8d7e5;">' +
      '<th style="text-align:left;padding:4px 6px;font-weight:normal;color:#9a9ea4;font-size:12px;">Role</th>' +
      '<th style="text-align:left;padding:4px 6px;font-weight:normal;color:#9a9ea4;font-size:12px;">Scope</th>' +
      '<th style="text-align:right;padding:4px 6px;font-weight:normal;color:#9a9ea4;font-size:12px;width:80px;">Granted</th>' +
      '</tr></thead>' +
      '<tbody>' + roleRows + '</tbody>' +
      '</table>';

    return (
      '<div id="_ui_cepi_form_layouter">' +
      fieldsHtml +
      sectionHeader +
      rolesTable +
      '</div>'
    );
  }

  /* ── Native toolbar hooks (Edit / Save / Cancel) ────────────────────── */

  function setupToolbarHooks() {
    var editTb   = document.querySelector('[data-debug-id="administration.form.button.edit"]');
    var saveTb   = document.querySelector('[data-debug-id="administration.form.button.save"]');
    var cancelTb = document.querySelector('[data-debug-id="administration.form.button.cancel"]');

    if (editTb && !editTb._cepiHooked) {
      editTb._cepiHooked = true;
      editTb.addEventListener("click", function (e) {
        if (_activePermId === null) return;
        e.stopPropagation();
        e.stopImmediatePropagation();
        _editBuffer = {};
        var src = _grantedMap[_activePermId] || {};
        ROLES.forEach(function (r) { _editBuffer[r.name] = !!src[r.name]; });
        _editMode = true;
        renderDetailPanel();
      }, true);
    }

    if (saveTb && !saveTb._cepiHooked) {
      saveTb._cepiHooked = true;
      saveTb.addEventListener("click", function (e) {
        if (_activePermId === null || !_editMode) return;
        e.stopPropagation();
        e.stopImmediatePropagation();
        _grantedMap[_activePermId] = {};
        for (var k in _editBuffer) {
          if (Object.prototype.hasOwnProperty.call(_editBuffer, k)) {
            _grantedMap[_activePermId][k] = _editBuffer[k];
          }
        }
        saveGrants();
        _editMode = false;
        renderDetailPanel();
      }, true);
    }

    if (cancelTb && !cancelTb._cepiHooked) {
      cancelTb._cepiHooked = true;
      cancelTb.addEventListener("click", function (e) {
        if (_activePermId === null || !_editMode) return;
        e.stopPropagation();
        e.stopImmediatePropagation();
        _editMode = false;
        renderDetailPanel();
      }, true);
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
        parentRow.style.background = "#CDE6EB";
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
        row.style.background = "#CDE6EB";
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
    setupToolbarHooks();
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
