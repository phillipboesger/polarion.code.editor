---
paths:
  - "META-INF/**"
  - "plugin.xml"
---
# hivemodule.xml and plugin.xml

- `META-INF/hivemodule.xml` registers the admin page extender (`administrationPageExtenders`) that surfaces the Code Editor entry, plus the `customNavigationExtenders` sidebar contribution (`CodeEditorNavigationExtender`) for the User View entry. Both exist and work on Polarion 2606 (3.26.6): `NavigationExtender`, `NavigationExtenderNode` and the `customNavigationExtenders` configuration-point (module `com.polarion.xray.webui`, same module as `administrationPageExtenders`) still ship, and the 2606 interface declares exactly the six abstract methods our class implements.
- Before deleting a contribution because an API was "removed in version X", verify against `com.polarion.alm.ui_<ver>/ui.jar` in a real container. A startup FATAL once blamed on this contribution was actually duplicate-bundle loading (see `PROJECT_LOG.md` 2026-04-19 and 2026-08-09).
- `plugin.xml` registers the webapp context root `polarion/code-editor`.
- Class names referenced from `hivemodule.xml` must match real Java classes, or Polarion silently fails to load the contribution.
