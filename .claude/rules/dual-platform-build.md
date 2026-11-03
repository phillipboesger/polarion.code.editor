---
paths:
  - "pom.xml"
  - "src/main/transformer/**"
  - "src/main/webapp/WEB-INF/**"
  - "src/main/java/**/api/CodeEditorServlet.java"
  - ".github/workflows/**"
---
# Dual-platform build (Polarion 2512 + 2606)

Sources are **javax.servlet-only** (`CodeEditorServlet.java`, `WEB-INF/web.xml`); do not hand-write a jakarta variant. `maven-jar-plugin` produces the javax build directly under the `pre2606` classifier; `org.eclipse.transformer:transformer-maven-plugin` (with `<extensions>true</extensions>` + `<classifier>-</classifier>`) rewrites its compiled bytecode and `web.xml` (via `src/main/transformer/*.properties`) to `jakarta.servlet`/Servlet 6.1 and becomes the project's **primary (no-suffix) artifact directly**: no post-package rename step, so `mvn install`/`mvn deploy` work too. Intentionally inverted from a naive "javax is the default" scheme, because Polarion 2606 is the primary target.

Both JARs compile against the **stable 3.25.12 / 5.25.12** platform API and carry a 3.25.12 `Require-Bundle` floor. Do **not** bump `polarion.version` to 3.26.6 to "modernize": a `Require-Bundle` version is a *minimum*, so a 3.26.6 floor would stop the `-pre2606` jar resolving on Polarion 2512, the only reason that jar exists. The 2606 API is covered by the `compile-2606` CI job, which recompiles with `-Dpolarion.version=3.26.6 -Dsubterra.version=5.26.6` as verification only (`compile`, src/main only, no artifact, no manifest; `test-compile` is deliberately not used, because `PolarionUtilsTest` hand-implements `ITransactionService`, whose `getTransaction()`/`getUserTransaction()` return `javax.transaction.*` on 3.25.12 but `jakarta.transaction.*` on 3.26.6, so that stub cannot compile against both). If that job fails while `Build & Test` passes, fix the source, don't raise the floor. Full pattern and pitfalls: skill `polarion-2606-jakarta-migration`.
