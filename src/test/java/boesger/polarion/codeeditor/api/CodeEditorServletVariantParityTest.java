package boesger.polarion.codeeditor.api;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * Guards the dual-platform servlet. {@code CodeEditorServlet} exists twice — a
 * javax.servlet variant (Polarion 2512 / Tomcat 9) and a jakarta.servlet variant
 * (Polarion 2606 / Tomcat 11) — and only one is compiled per Maven profile. This
 * test runs in the default (javax) build and fails if the two copies drift apart
 * by anything other than the servlet API package prefix, so a fix applied to one
 * variant can never silently miss the other.
 */
public class CodeEditorServletVariantParityTest {

	private static final Path JAVAX_VARIANT = Paths.get(
			"src/main/java-javax/boesger/polarion/codeeditor/api/CodeEditorServlet.java");
	private static final Path JAKARTA_VARIANT = Paths.get(
			"src/main/java-jakarta/boesger/polarion/codeeditor/api/CodeEditorServlet.java");

	@Test
	public void variantsAreIdenticalExceptForServletNamespace() throws IOException {
		String javaxSource = read(JAVAX_VARIANT);
		String jakartaSource = read(JAKARTA_VARIANT);

		// Sanity: each file really uses its own namespace (guards against an
		// accidental copy/paste that leaves both on the same one).
		assertTrue("javax variant must import javax.servlet.*",
				javaxSource.contains("import javax.servlet."));
		assertTrue("jakarta variant must import jakarta.servlet.*",
				jakartaSource.contains("import jakarta.servlet."));

		// Compare the code from the first import onward (ignoring the file-header
		// banner, which is intentionally platform-specific), after collapsing the
		// jakarta namespace onto the javax one.
		String javaxBody = codeBody(javaxSource);
		String jakartaBody = codeBody(jakartaSource).replace("jakarta.servlet", "javax.servlet");

		assertEquals(
				"The src/main/java-javax and src/main/java-jakarta copies of "
						+ "CodeEditorServlet.java have diverged beyond the servlet namespace. "
						+ "Re-sync them so the only difference is javax.servlet <-> jakarta.servlet.",
				javaxBody, jakartaBody);
	}

	/** Returns the source from the first {@code import} statement onward (drops the package line and banner comment). */
	private static String codeBody(String source) {
		String normalized = source.replace("\r\n", "\n");
		int idx = normalized.indexOf("\nimport ");
		assertTrue("source must contain an import section", idx >= 0);
		return normalized.substring(idx + 1);
	}

	private static String read(Path path) throws IOException {
		assertTrue("expected variant source file is missing: " + path.toAbsolutePath(),
				Files.isRegularFile(path));
		return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
	}
}
