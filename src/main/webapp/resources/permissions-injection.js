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
  var _grantedMap = {};        // permId → { roleName: null|true|false }
  var _activePermId = null;
  var _editMode = false;
  var _editBuffer = {};
  var _customSets = [];        // [{ id, name, filter, grants:{permId:{role:null|true|false}} }]
  var _editingSetId = null;    // id of set being edited, or 'new'
  var _setEditBuffer = {};     // working copy when editing a set

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

  /** Return image src for a grant state: null=grey-deny, true=green-grant, false=red-deny */
  function grantImg(p, state) {
    if (state === true)  return p.base + 'yes.png' + p.bid;
    if (state === false) return p.base + 'checkbox/no.png' + p.bid;
    return p.base + 'noGrey.png' + p.bid;  // null / undefined
  }

  /** Cycle grant state: null → true → false → null */
  function cycleGrant(current) {
    if (current === null || current === undefined) return true;
    if (current === true) return false;
    return null;
  }

  function loadGrants() {
    try {
      var stored = localStorage.getItem("cepi-grants");
      if (stored) _grantedMap = JSON.parse(stored);
    } catch (e) {}
    PERMISSIONS.forEach(function (perm) {
      if (!_grantedMap[perm.id]) _grantedMap[perm.id] = {};
      ROLES.forEach(function (role) {
        if (!Object.prototype.hasOwnProperty.call(_grantedMap[perm.id], role.name)) {
          _grantedMap[perm.id][role.name] = null;  // null = not set
        }
      });
    });
  }

  function saveGrants() {
    try {
      localStorage.setItem("cepi-grants", JSON.stringify(_grantedMap));
    } catch (e) {}
  }

  function loadCustomSets() {
    try {
      var stored = localStorage.getItem('cepi-custom-sets');
      if (stored) _customSets = JSON.parse(stored);
    } catch (e) { _customSets = []; }
  }

  function saveCustomSets() {
    try { localStorage.setItem('cepi-custom-sets', JSON.stringify(_customSets)); } catch (e) {}
  }

  function genId() {
    return 'set-' + Math.random().toString(36).slice(2, 9);
  }

  /* ── Group detail panel (click on "Code Editor" row body) ───────────── */

  function buildCustomSetEditorHtml(set) {
    // set = null means new set
    var name   = set ? escHtml(set.name || '') : '';
    var filter = set ? escHtml(set.filter || '') : '';
    var thStyle = 'white-space:nowrap;color:#757575;font-weight:normal;border-bottom:1px solid #d5d6da;' +
                  'height:28px;padding:0 4px;vertical-align:middle;text-align:left;';
    var tdStyle = 'white-space:nowrap;border-bottom:1px solid #D2D7DA;padding:0 4px;height:28px;vertical-align:middle;';

    var p = imgPaths();
    var rolesSection = '';
    if (ROLES.length > 0) {
      var permCols = PERMISSIONS.map(function(perm) {
        return '<th class="polarion-TableDataHeader" style="' + thStyle + '">' + escHtml(perm.label) + '</th>';
      }).join('');

      var roleRows = ROLES.map(function(role) {
        var cells = PERMISSIONS.map(function(perm) {
          var state = (set && set.grants && set.grants[perm.id]) ? set.grants[perm.id][role.name] : null;
          // normalize old boolean values
          if (state === false && _setEditBuffer && _setEditBuffer[perm.id]) state = _setEditBuffer[perm.id][role.name];
          return '<td class="polarion-TableDataRow" style="' + tdStyle + 'text-align:center;">' +
            '<img src="' + grantImg(p, state) + '"' +
            ' data-cepi-set-toggle="' + escHtml(perm.id) + ':' + escHtml(role.name) + '"' +
            ' style="cursor:pointer;display:inline-block;vertical-align:middle;">' +
            '</td>';
        }).join('');
        return '<tr>' +
          '<td class="polarion-TableDataRow" style="' + tdStyle + '">' + escHtml(role.name) + '</td>' +
          '<td class="polarion-TableDataRow" style="' + tdStyle + '">' + escHtml(role.scope) + '</td>' +
          cells +
          '</tr>';
      }).join('');

      rolesSection =
        '<div class="polarion-JSPreviewPanelTitleClick" style="margin-top:8px;">' +
        '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody><tr>' +
        '<td class="polarion-JSPreviewPanel-TitleTd">Role Grants (click to cycle: grey \u2192 green \u2192 red)</td>' +
        '</tr></tbody></table></div>' +
        '<table cellspacing="0" cellpadding="0" class="polarion-JSPreviewPanel-PanelFixed">' +
        '<tbody><tr><td style="padding:0 10px;width:100%;">' +
        '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">' +
        '<tbody><tr>' +
        '<th class="polarion-TableDataHeader" style="' + thStyle + '">Role</th>' +
        '<th class="polarion-TableDataHeader" style="' + thStyle + '">Scope</th>' +
        permCols +
        '</tr>' + roleRows + '</tbody></table>' +
        '</td></tr></tbody></table>';
    }

    return (
      '<div class="GLNRHCCBOBB" style="margin-top:8px;">' +
      '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody>' +
      '<tr><td class="polarion-NameCell"><span>Name:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell">' +
      '<input type="text" data-cepi-set-name value="' + name + '" style="width:100%;box-sizing:border-box;">' +
      '</td></tr>' +
      '<tr><td class="polarion-NameCell"><span>Filter:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell">' +
      '<input type="text" data-cepi-set-filter value="' + filter + '" placeholder="e.g. *.java, src/**, text/xml" style="width:100%;box-sizing:border-box;">' +
      '</td></tr>' +
      '</tbody></table></div>' +
      rolesSection +
      '<div style="margin-top:10px;display:flex;gap:8px;">' +
      '<span class="polarion-ToolbarButton-Label" data-cepi-action="set-save"' +
      ' style="cursor:pointer;padding:3px 10px;border:1px solid #aaa;background:#f5f5f5;border-radius:2px;">Save Set</span>' +
      '<span class="polarion-ToolbarButton-Label" data-cepi-action="set-cancel"' +
      ' style="cursor:pointer;padding:3px 10px;border:1px solid #aaa;background:#f5f5f5;border-radius:2px;">Cancel</span>' +
      '</div>'
    );
  }

  function buildGroupDetailHtml(p) {
    var permList = PERMISSIONS.map(function (perm) {
      return (
        "<li style='margin-bottom:8px;'>" +
        "<tt>" + escHtml(perm.id) + "</tt> &ndash; <strong>" + escHtml(perm.label) + "</strong>" +
        "<br><span style='color:#555;'>" + escHtml(perm.description || "") + "</span>" +
        "</li>"
      );
    }).join("");

    // ── Custom Sets section ──────────────────────────────────────────────
    var thStyle = 'white-space:nowrap;color:#757575;font-weight:normal;border-bottom:1px solid #d5d6da;height:28px;padding:0 4px;vertical-align:middle;text-align:left;';
    var tdStyle = 'white-space:nowrap;border-bottom:1px solid #D2D7DA;padding:0 4px;height:32px;vertical-align:middle;';

    var setsRows = _customSets.map(function(set) {
      return '<tr>' +
        '<td class="polarion-TableDataRow" style="' + tdStyle + '">' + escHtml(set.name || '') + '</td>' +
        '<td class="polarion-TableDataRow" style="' + tdStyle + '"><tt>' + escHtml(set.filter || '') + '</tt></td>' +
        '<td class="polarion-TableDataRow" style="' + tdStyle + 'text-align:right;white-space:nowrap;">' +
        '<span data-cepi-action="set-edit" data-cepi-set-id="' + escHtml(set.id) + '"' +
        ' style="cursor:pointer;margin-right:6px;color:#1a7fbc;" title="Edit">&#9998;</span>' +
        '<span data-cepi-action="set-delete" data-cepi-set-id="' + escHtml(set.id) + '"' +
        ' style="cursor:pointer;color:#c00;" title="Delete">&times;</span>' +
        '</td></tr>';
    }).join('');

    var setsTable = _customSets.length > 0
      ? '<table cellspacing="0" cellpadding="0" class="polarion-JSPreviewPanel-PanelFixed">' +
        '<tbody><tr><td style="padding:0 10px;width:100%;">' +
        '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">' +
        '<tbody><tr>' +
        '<th class="polarion-TableDataHeader" style="width:40%;' + thStyle + '">Name</th>' +
        '<th class="polarion-TableDataHeader" style="width:50%;' + thStyle + '">Filter Pattern</th>' +
        '<th class="polarion-TableDataHeader" style="width:80px;' + thStyle + '">Actions</th>' +
        '</tr>' + setsRows +
        '</tbody></table></td></tr></tbody></table>'
      : '<table cellspacing="0" cellpadding="0" class="polarion-JSPreviewPanel-PanelFixed">' +
        '<tbody><tr><td style="padding:6px 10px;color:#888;font-style:italic;">No custom sets defined.</td></tr></tbody></table>';

    // If currently editing a set, show editor inline
    var editorSection = '';
    if (_editingSetId) {
      var editingSet = null;
      if (_editingSetId !== 'new') {
        editingSet = null;
        for (var i = 0; i < _customSets.length; i++) {
          if (_customSets[i].id === _editingSetId) { editingSet = _customSets[i]; break; }
        }
      }
      editorSection =
        '<div class="polarion-JSPreviewPanelTitleClick" style="margin-top:8px;">' +
        '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody><tr>' +
        '<td class="polarion-JSPreviewPanel-TitleTd">' +
        (_editingSetId === 'new' ? 'New Custom Set' : 'Edit: ' + escHtml(editingSet ? editingSet.name : '')) +
        '</td></tr></tbody></table></div>' +
        buildCustomSetEditorHtml(editingSet);
    }

    return (
      '<div id="_ui_cepi_form_layouter" data-cepi-form="true">' +
      '<div class="GLNRHCCBOBB">' +
      '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody>' +
      '<tr>' +
      '<td class="polarion-NameCell"><span>Plugin:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<img src="/polarion/code-editor/resources/img/code-editor-icon-light.svg" style="width:24px;height:24px;display:block;">' +
      '<span><strong>Code Editor</strong> &nbsp;<tt style="color:#888;font-size:11px;">boesger.polarion.codeeditor</tt></span>' +
      '</div>' +
      '</td></tr>' +
      '<tr><td class="polarion-NameCell"><span>Description:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell">' +
      'The Code Editor plugin extends Polarion with a browser-based file editor.' +
      '</td></tr>' +
      '<tr><td class="polarion-NameCell"><span>Applicable&nbsp;permissions:</span></td>' +
      '<td class="polarion-SectionLayouterContentCell">' +
      '<ul style="margin:2px 0 0 0;padding-left:18px;">' + permList + '</ul>' +
      '</td></tr>' +
      '</tbody></table></div>' +

      // Custom Sets header
      '<div class="polarion-JSPreviewPanelTitleClick">' +
      '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody><tr>' +
      '<td class="polarion-JSPreviewPanel-TitleTd">Custom Permission Sets</td>' +
      '<td style="white-space:nowrap;">' +
      '<span data-cepi-action="set-new" style="cursor:pointer;margin-left:12px;padding:1px 8px;' +
      'border:1px solid #aaa;background:#f5f5f5;border-radius:2px;font-size:11px;" title="Add new set">+ Add Set</span>' +
      '</td></tr></tbody></table></div>' +
      setsTable +
      editorSection +
      '</div>'
    );
  }

  /* ── Permission detail panel (click on child row) ───────────────────── */

  function buildDetailHtml(perm, grants, editMode, p) {
    var base = p.base, bid = p.bid;

    // Description fields block
    var fieldsHtml =
      '<div class="GLNRHCCBOBB">' +
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
        '<div id="_ui_cepi_form_layouter" data-cepi-form="true">' +
        fieldsHtml +
        '<div class="polarion-JSPreviewPanelTitleClick">' +
        '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody><tr>' +
        '<td class="polarion-JSPreviewPanel-TitleTd">Applicable Roles</td>' +
        '</tr></tbody></table>' +
        '</div>' +
        '<table cellspacing="0" cellpadding="0" class="polarion-JSPreviewPanel-PanelFixed">' +
        '<tbody><tr><td style="padding-left:10px;padding-right:10px;width:100%;">' +
        '<div style="padding:6px 0;color:#888;font-style:italic;">Role definitions not yet loaded. Click any native permission row first.</div>' +
        '</td></tr></tbody></table>' +
        '</div>'
      );
    }

    // Section header – OOTB Polarion style
    var sectionHeader;
    if (editMode) {
      sectionHeader =
        '<div class="polarion-JSPreviewPanelTitleClick">' +
        '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody><tr>' +
        '<td class="polarion-JSPreviewPanel-TitleTd">Applicable Roles</td>' +
        '<td style="white-space:nowrap;padding-right:4px;">' +
        '<span style="cursor:pointer;margin-right:4px;" data-cepi-action="save">' +
        '<span class="polarion-ToolbarButton-Label" style="padding:2px 8px;border:1px solid #aaa;background:#f5f5f5;border-radius:2px;font-size:11px;">Save</span>' +
        '</span>' +
        '<span style="cursor:pointer;" data-cepi-action="cancel">' +
        '<span class="polarion-ToolbarButton-Label" style="padding:2px 8px;border:1px solid #aaa;background:#f5f5f5;border-radius:2px;font-size:11px;">Cancel</span>' +
        '</span>' +
        '</td>' +
        '</tr></tbody></table>' +
        '</div>';
    } else {
      sectionHeader =
        '<div class="polarion-JSPreviewPanelTitleClick">' +
        '<table cellspacing="0" cellpadding="0" style="width:100%"><tbody><tr>' +
        '<td class="polarion-JSPreviewPanel-TitleTd">Applicable Roles</td>' +
        '<td style="white-space:nowrap;">' +
        '<span style="cursor:pointer;margin-left:12px;" data-cepi-action="edit">' +
        '<img class="polarion-IconHover" style="vertical-align:middle;" src="' + base + 'portlet/portletEdit.png' + bid + '" title="Edit">' +
        '</span>' +
        '</td>' +
        '</tr></tbody></table>' +
        '</div>';
    }

    var tdStyle = 'white-space:nowrap;border-bottom:1px solid #D2D7DA;padding-left:4px;padding-right:4px;height:32px;vertical-align:middle;';
    var editHint = editMode ? ' title="Click to cycle: grey\u2192green\u2192red"' : '';
    var roleRows = ROLES.map(function (role) {
      var state = grants[role.name];
      // normalize legacy boolean true → true, false → false, undefined → null
      if (state === undefined) state = null;
      var grantedCell;
      if (editMode) {
        grantedCell =
          '<td class="polarion-TableDataRow" style="' + tdStyle + 'text-align:center;">' +
          '<img src="' + grantImg(p, state) + '"' +
          ' data-cepi-role-toggle="' + escHtml(role.name) + '"' +
          editHint +
          ' style="cursor:pointer;display:inline-block;vertical-align:middle;">' +
          '</td>';
      } else {
        var imgSrc = (state !== null && state !== undefined) ? grantImg(p, state) : '';
        grantedCell =
          '<td class="polarion-TableDataRow" style="' + tdStyle + '">' +
          (imgSrc ? '<img src="' + imgSrc + '" title="' + (state === true ? 'Granted' : 'Denied') + '">' : '') +
          '</td>';
      }
      return (
        '<tr>' +
        '<td class="polarion-TableDataRow" style="' + tdStyle + '"><div style="overflow:hidden;">' + escHtml(role.name) + '</div></td>' +
        '<td class="polarion-TableDataRow" style="' + tdStyle + '">' + escHtml(role.scope) + '</td>' +
        grantedCell +
        '</tr>'
      );
    }).join('');

    var thStyle = 'white-space:nowrap;color:#757575;font-weight:normal;border-bottom:1px solid #d5d6da;height:28px;padding-right:4px;padding-left:4px;vertical-align:middle;text-align:left;';
    var rolesTable =
      '<table cellspacing="0" cellpadding="0" class="polarion-JSPreviewPanel-PanelFixed">' +
      '<tbody><tr><td style="padding-left:10px;padding-right:10px;width:100%;">' +
      '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">' +
      '<tbody><tr>' +
      '<th class="polarion-TableDataHeader" style="width:50%;' + thStyle + '">Role</th>' +
      '<th class="polarion-TableDataHeader" style="width:50%;' + thStyle + '">Scope</th>' +
      '<th class="polarion-TableDataHeader" style="width:50px;' + thStyle + '">Granted</th>' +
      '</tr>' +
      roleRows +
      '</tbody></table>' +
      '</td></tr></tbody></table>';

    return (
      '<div id="_ui_cepi_form_layouter" data-cepi-form="true">' +
      fieldsHtml +
      sectionHeader +
      rolesTable +
      '</div>'
    );
  }

  /* ── Native toolbar hooks (Refresh only – Save/Cancel are inline) ──────── */

  function setupToolbarHooks() {
    var refreshTb = (function () {
      var img = Array.from(document.querySelectorAll("img.polarion-ToolbarButton-Icon")).find(function (i) {
        return (i.src || "").indexOf("refreshBtn") !== -1;
      });
      if (!img) return null;
      var el = img;
      while (el && el.tagName !== "TD") el = el.parentElement;
      return el || img;
    })();

    if (refreshTb && !refreshTb._cepiHooked) {
      refreshTb._cepiHooked = true;
      refreshTb.addEventListener("click", function (e) {
        if (_activePermId === null) return;
        e.stopPropagation();
        e.stopImmediatePropagation();
        _editMode = false;
        renderDetailPanel();
      }, true);
    }

    // Deselect cepi when user clicks any OOTB row
    var tableContainer = document.querySelector('.polarion-JSTreeTable-TableContainer, .polarion-JSTreeTable') || document.body;
    if (tableContainer && !tableContainer._cepiClickHooked) {
      tableContainer._cepiClickHooked = true;
      tableContainer.addEventListener('click', function (e) {
        var target = e.target;
        // Walk up to find a JSTreeTableRow
        while (target && target !== tableContainer) {
          if (target.classList && target.classList.contains('JSTreeTableRow') &&
              !target.getAttribute('data-cepi-parent') && !target.getAttribute('data-cepi-child')) {
            // Clicked on a native OOTB row → deselect cepi
            deselectAll();
            _activePermId = null;
            _editMode = false;
            return;
          }
          target = target.parentElement;
        }
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
    var grants = _editMode ? _editBuffer : (_grantedMap[perm.id] || {});
    content.innerHTML = buildDetailHtml(perm, grants, _editMode, p);

    // Image toggle handlers (edit mode – cycle through null → true → false → null)
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
              _editBuffer[role] = cycleGrant(_editBuffer[role]);
              img.src = grantImg(p, _editBuffer[role]);
            },
            true,
          );
        });

      // Inline Save button
      var saveBtn = content.querySelector('[data-cepi-action="save"]');
      if (saveBtn) {
        saveBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
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

      // Inline Cancel button
      var cancelBtn = content.querySelector('[data-cepi-action="cancel"]');
      if (cancelBtn) {
        cancelBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          _editMode = false;
          renderDetailPanel();
        });
      }
    }

    // Pencil Edit button (view mode)
    var editBtn = content.querySelector('[data-cepi-action="edit"]');
    if (editBtn) {
      editBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        _editBuffer = {};
        var src = _grantedMap[perm.id] || {};
        ROLES.forEach(function (r) {
          var v = src[r.name];
          _editBuffer[r.name] = (v === undefined) ? null : v;
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
    _attachGroupPanelHandlers(content);
  }

  function _attachGroupPanelHandlers(content) {
    // Add new set
    var addBtn = content.querySelector('[data-cepi-action="set-new"]');
    if (addBtn) {
      addBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        _editingSetId = 'new';
        _setEditBuffer = { name: '', filter: '' };
        // Init grant buffer for new set
        PERMISSIONS.forEach(function(perm) {
          _setEditBuffer[perm.id] = {};
          ROLES.forEach(function(role) { _setEditBuffer[perm.id][role.name] = null; });
        });
        showGroupDetailPanel();
      });
    }

    // Edit existing set
    content.querySelectorAll('[data-cepi-action="set-edit"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var id = btn.getAttribute('data-cepi-set-id');
        var set = null;
        for (var i = 0; i < _customSets.length; i++) {
          if (_customSets[i].id === id) { set = _customSets[i]; break; }
        }
        if (!set) return;
        _editingSetId = id;
        _setEditBuffer = { name: set.name, filter: set.filter };
        PERMISSIONS.forEach(function(perm) {
          _setEditBuffer[perm.id] = {};
          ROLES.forEach(function(role) {
            var v = set.grants && set.grants[perm.id] ? set.grants[perm.id][role.name] : null;
            _setEditBuffer[perm.id][role.name] = (v === undefined) ? null : v;
          });
        });
        showGroupDetailPanel();
      });
    });

    // Delete set
    content.querySelectorAll('[data-cepi-action="set-delete"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var id = btn.getAttribute('data-cepi-set-id');
        _customSets = _customSets.filter(function(s) { return s.id !== id; });
        saveCustomSets();
        _editingSetId = null;
        showGroupDetailPanel();
      });
    });

    // Set-editor: role grant toggles
    content.querySelectorAll('[data-cepi-set-toggle]').forEach(function(img) {
      var key = img.getAttribute('data-cepi-set-toggle');  // "permId:roleName"
      var parts = key.split(':');
      var permId = parts[0], roleName = parts.slice(1).join(':');
      img.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!_setEditBuffer[permId]) _setEditBuffer[permId] = {};
        _setEditBuffer[permId][roleName] = cycleGrant(_setEditBuffer[permId][roleName]);
        var p = imgPaths();
        img.src = grantImg(p, _setEditBuffer[permId][roleName]);
      });
    });

    // Save set
    var setsSaveBtn = content.querySelector('[data-cepi-action="set-save"]');
    if (setsSaveBtn) {
      setsSaveBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var nameInp = content.querySelector('[data-cepi-set-name]');
        var filterInp = content.querySelector('[data-cepi-set-filter]');
        var name = nameInp ? nameInp.value.trim() : '';
        var filter = filterInp ? filterInp.value.trim() : '';
        if (!name) { alert('Please enter a set name.'); return; }
        var grants = {};
        PERMISSIONS.forEach(function(perm) {
          grants[perm.id] = {};
          ROLES.forEach(function(role) {
            var v = _setEditBuffer[perm.id] ? _setEditBuffer[perm.id][role.name] : null;
            grants[perm.id][role.name] = (v === undefined) ? null : v;
          });
        });
        if (_editingSetId === 'new') {
          _customSets.push({ id: genId(), name: name, filter: filter, grants: grants });
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
    var setsCancelBtn = content.querySelector('[data-cepi-action="set-cancel"]');
    if (setsCancelBtn) {
      setsCancelBtn.addEventListener('click', function(e) {
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
      .querySelectorAll(".JSTreeTableRow.selected:not([data-cepi-parent]):not([data-cepi-child])")
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
      // If native Polarion panel appeared, deselect cepi rows and clear active perm.
      // We use a flag: _cepiPanelActive is true when we intentionally showed our panel.
      // If Polarion replaces our panel (mutation fires, _cepiPanelActive still true but panel content changed),
      // clear cepi selection.
      // Simple heuristic: if a cepi row is selected but _activePermId is null, we're in transition.
      // Instead: clear cepi selection only when Polarion shows its native panel for a non-cepi entity.
      var hasCepiSelected = !!document.querySelector('[data-cepi-parent][data-cepi-selected="true"],[data-cepi-child][data-cepi-selected="true"]');
      if (hasCepiSelected && _activePermId === null) {
        // Cepi row visually selected but our panel state is gone - clear visual state
        deselectAll();
      }
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
// ── END OF FILE ─────────────────────────────────────────────────────────────
