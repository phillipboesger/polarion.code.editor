# Custom Permissions — Developer Notes

The Code Editor plugin contributes two custom Polarion permissions, enforces them itself, and
surfaces them in Polarion's native Permissions editor. This document explains how the pieces fit
so future changes stay on the supported path.

## The two permissions

| Id | Constant | Meaning |
| :--- | :--- | :--- |
| `boesger.codeeditor.read` | `CodeEditorPermission.PERMISSION_READ` | Read access (browse tree, open/download files). |
| `boesger.codeeditor.write` | `CodeEditorPermission.PERMISSION_WRITE` | Write access (create/modify/rename/delete). |

Defined in `src/main/java/boesger/polarion/codeeditor/security/CodeEditorPermission.java`.

## 1. Registration — making the permission real (enforcement)

Custom permissions are registered with Polarion's security framework by contributing a
**permission factory** in `META-INF/hivemodule.xml`:

```xml
<service-point id="CodeEditorPermissionFactory" interface="com.polarion.platform.spi.security.IPermissionFactory">
  <invoke-factory>
    <construct class="com.polarion.platform.spi.security.GenericPermissionFactory">
      <set-object property="permissionClass" value="class:com.polarion.platform.security.Permission"/>
      <set property="description" value="Code Editor plugin access: ..."/>
    </construct>
  </invoke-factory>
</service-point>

<contribution configuration-id="com.polarion.platform.security.permissionFactories">
  <factory prefix="boesger.codeeditor" service="CodeEditorPermissionFactory"/>
</contribution>
```

- `GenericPermissionFactory` builds a plain `com.polarion.platform.security.Permission` for any id
  under the `boesger.codeeditor` prefix, so no custom permission class is needed.
- Without this contribution, `ISecurityService.constructPermission("boesger.codeeditor.read")`
  throws `IllegalArgumentException`, and the permission can never be checked. This was the original
  bug — the permission was used but never registered, so enforcement silently fell back to roles.
- Verified on a live Polarion 2512: with the factory present, `constructPermission` / `hasPermission`
  resolve and evaluate grants with native global→project inheritance.

> A `META-INF/permissions.xml` file with `<permission id="…">` is **not** a Polarion descriptor —
> nothing reads it. The platform registers its own permissions the same factory way (see
> `platform.jar/META-INF/security-hivemodule.xml`, e.g. `com.polarion.security.login`).

`hivemodule.xml` is already packaged into the JAR by the existing `pom.xml` resource rule.

## 2. Enforcement

`src/main/java/boesger/polarion/codeeditor/api/CodeEditorServlet.java`:

- `init()` constructs the two permissions once via `constructPermissionSafely(...)`.
- Each request resolves the scope: `ContextId.getContextIdFromContext(projectId)` when a
  `projectId` query parameter is present, else `ContextId.getGlobalContextId()`.
- `hasPermission(permission, projectId)` calls `ISecurityService.hasPermission(permission, ctx)`
  **once** — Polarion applies project‑first / global‑fallback resolution internally. Do **not** OR
  the project result with the global context; that would re-grant a project‑denied permission.
- `doGet` requires `read` (except `/health` and `/permissions`); `doPut`/`doPost`/`doDelete`
  require `write`. Missing permission → `403`; unauthenticated → `401`.
- **The scope checked is the scope actually resolved, not the requested `projectId`.** A file name
  that does not exist under the project resolves to the global repository root, so an operation sent
  with `?projectId=X` can act globally; single-file requests are therefore authorized against the
  resolved location (`CodeEditorService.resolvesToGlobalScope`), and a rename must clear the check
  for both names. Likewise `/config/list` merges global files into a project listing, so those are
  filtered out for a caller without global `read`.
- **Fail closed:** if a permission cannot be constructed (factory missing) the field is `null` and
  access is denied. There is **no admin‑role bypass** — a deliberately denied non‑admin is blocked;
  a global `admin` still passes because Polarion grants admin every permission natively.

## 3. Editor display — the injection (why it exists)

Polarion's **Permissions Management** editor builds its tree from a fixed catalog baked into its
GWT client (Work Items, Documents, …, Polarion Copilot, REST API Endpoints). A plugin **cannot**
add a node to that catalog — verified empirically: a factory-registered custom permission enforces
correctly but does **not** appear in the editor. To let admins manage the grants in the usual place,
the plugin injects the two rows itself:

- `src/main/webapp/editor.html` contains a small bootstrap: when the Code Editor admin page is
  loaded in the admin SPA's iframe, it injects `resources/permissions-injection.js` into the parent
  document (same origin, idempotent — guarded by `[data-cepi-parent]` / `#cepi-permissions-script`).
  **Known limitation:** that bootstrap is the only loader, so the Code Editor rows appear on the
  Permissions Management page only once the Code Editor page has been opened in the same SPA session
  (the script lives in the parent document and is lost on a full page reload). An admin who loads
  Polarion and goes straight to Permissions Management sees no Code Editor rows.
- `permissions-injection.js` detects the Permissions Management page (global and project scope),
  appends a **Code Editor** parent row + READ/WRITE child rows to the native JSTreeTable, clones the
  role columns, renders tri‑state grant/deny/inherited cells, and hooks Save/Cancel.
- It reads/writes grants through the backend below; the injected rows persist to the same
  `permissions.xml` that enforcement reads.

This UI layer is intentionally cosmetic/management-only — all access decisions are made by §2.

## 4. Grant persistence backend

`src/main/java/boesger/polarion/codeeditor/service/PermissionsService.java` reads/writes only the
`boesger.codeeditor.*` role blocks of `.polarion/security/permissions.xml` (global at the repo root,
or `PROJECT_FOLDER/.polarion/security/` for a project), preserving all other content. It is
XXE‑hardened and writes in the standard `<role name="…"><grant|deny permission="…"/></role>` format
that Polarion's `ACLParser` reads.

Exposed via two servlet endpoints, both **admin‑gated** (`canManagePermissions`, which requires the
global `admin` role or `project_admin`/`admin` in the project scope) and therefore exempt from the
read/write code‑editor checks:

- `GET  /polarion/code-editor/api/permissions[?projectId=…]` →
  `{ "grants": { permId: { role: bool } }, "customSets": [ … ] }`.
  A read failure is reported as `500`, **not** as an empty grant map: rendering "nothing is granted"
  as if it were the truth would make the next save (which replaces every Code Editor role block)
  delete the real configuration.
- `POST /polarion/code-editor/api/permissions[?projectId=…]` → persists.
  `grants` is required and **replaces** all Code Editor grants. `customSets` is optional: omit it to
  leave the persisted sets untouched, or pass a list (`[]` included) to replace them. Both parts are
  written in a single read-modify-write cycle, so a request either applies fully or not at all.

## 5. Navigation

`CodeEditorNavigationExtender` is unchanged: `getRootNodes` returns an empty list and the base
`NavigationExtender` has no visibility hook, so the servlet is the enforcement boundary. The
"Code Editor" entry itself comes from the declarative `administrationPageExtenders` contribution.

## 6. Testing

- Unit: `CodeEditorServletTest` injects the permission fields and stubs
  `ISecurityService.hasPermission` to cover `200` / `401` / `403` and the fail‑closed path.
- Verified live (Polarion 2512 trial, Docker): factory registration resolves the permission;
  the injection renders the Code Editor rows in the native editor; `POST`/`GET /permissions`
  round‑trips and persists `<grant>/<deny>` to `permissions.xml`.
- E2E matrix to extend: the four states (grant/deny × explicit/inherited) × global/project scope,
  asserting servlet `200`/`403` and file read/write for a non‑admin user (a global `admin` cannot
  be denied).
