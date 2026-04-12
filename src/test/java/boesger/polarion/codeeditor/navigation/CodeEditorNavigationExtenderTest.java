package boesger.polarion.codeeditor.navigation;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;

import java.util.List;

import org.junit.Test;

import com.polarion.subterra.base.data.identification.IContextId;

public class CodeEditorNavigationExtenderTest {

	@Test
	public void getId_returnsExpectedValue() {
		CodeEditorNavigationExtender extender = new CodeEditorNavigationExtender();
		assertEquals("code-editor", extender.getId());
	}

	@Test
	public void getLabel_returnsExpectedValue() {
		CodeEditorNavigationExtender extender = new CodeEditorNavigationExtender();
		assertEquals("Code Editor", extender.getLabel());
	}

	@Test
	public void getIconUrl_containsExpectedPath() {
		CodeEditorNavigationExtender extender = new CodeEditorNavigationExtender();
		String iconUrl = extender.getIconUrl();
		assertNotNull(iconUrl);
		assertTrue(iconUrl.contains("code-editor"));
	}

	@Test
	public void getPageUrl_returnsEditorHtml() {
		CodeEditorNavigationExtender extender = new CodeEditorNavigationExtender();
		IContextId contextId = mock(IContextId.class);
		String pageUrl = extender.getPageUrl(contextId);
		assertNotNull(pageUrl);
		assertTrue(pageUrl.contains("editor.html"));
	}

	@Test
	public void requiresToken_returnsFalse() {
		CodeEditorNavigationExtender extender = new CodeEditorNavigationExtender();
		assertFalse(extender.requiresToken());
	}

	@Test
	public void getRootNodes_returnsEmptyList() {
		CodeEditorNavigationExtender extender = new CodeEditorNavigationExtender();
		IContextId contextId = mock(IContextId.class);
		List<?> nodes = extender.getRootNodes(contextId);
		assertNotNull(nodes);
		assertTrue(nodes.isEmpty());
	}

	@Test
	public void constructor_createsInstanceSuccessfully() {
		CodeEditorNavigationExtender extender = new CodeEditorNavigationExtender();
		assertNotNull(extender);
	}
}
