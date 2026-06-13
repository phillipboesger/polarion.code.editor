package boesger.polarion.codeeditor.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.lang.reflect.Method;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.Test;

import boesger.polarion.codeeditor.service.PermissionsService.CustomSet;

/**
 * Tests the custom permission set XML round-trip and content preservation of
 * {@link PermissionsService}. The SVN-backed read/write requires the Polarion platform, so these
 * tests exercise the pure XML parse/merge logic directly via reflection.
 */
public class PermissionsServiceTest {

	/**
	 * Invokes the private {@code mergeCustomSets(String, List)} on a scopeless service instance.
	 *
	 * @param existingXml the existing permissions.xml, or {@code null}
	 * @param sets        the custom sets to merge in
	 * @return the serialised, updated XML
	 * @throws Exception if reflection or merging fails
	 */
	private String merge(String existingXml, List<CustomSet> sets) throws Exception {
		PermissionsService svc = new PermissionsService(null);
		Method m = PermissionsService.class.getDeclaredMethod("mergeCustomSets", String.class, List.class);
		m.setAccessible(true);
		return (String) m.invoke(svc, existingXml, sets);
	}

	/**
	 * Invokes the private {@code parseCustomSets(String)} on a scopeless service instance.
	 *
	 * @param xml the permissions.xml to parse
	 * @return the parsed custom sets
	 * @throws Exception if reflection or parsing fails
	 */
	@SuppressWarnings("unchecked")
	private List<CustomSet> parse(String xml) throws Exception {
		PermissionsService svc = new PermissionsService(null);
		Method m = PermissionsService.class.getDeclaredMethod("parseCustomSets", String.class);
		m.setAccessible(true);
		return (List<CustomSet>) m.invoke(svc, xml);
	}

	/**
	 * Builds a single custom set with read granted to developer and denied to viewer.
	 *
	 * @return a list holding the one custom set
	 */
	private java.util.List<CustomSet> sampleSets() {
		CustomSet set = new CustomSet();
		set.id = "cepi-set-abc";
		set.name = "Internal docs";
		set.filter = "type:generic AND status:draft";
		set.grants = new LinkedHashMap<>();
		Map<String, Boolean> read = new LinkedHashMap<>();
		read.put("developer", true);
		read.put("viewer", false);
		set.grants.put("boesger.codeeditor.read", read);
		return java.util.List.of(set);
	}

	@Test
	public void mergeAndParse_whenRoundTripped_shouldPreserveSetAndGrants() throws Exception {
		String xml = merge(null, sampleSets());
		List<CustomSet> parsed = parse(xml);

		assertEquals(1, parsed.size());
		CustomSet s = parsed.get(0);
		assertEquals("cepi-set-abc", s.id);
		assertEquals("Internal docs", s.name);
		assertEquals("type:generic AND status:draft", s.filter);
		assertNotNull(s.grants.get("boesger.codeeditor.read"));
		assertEquals(Boolean.TRUE, s.grants.get("boesger.codeeditor.read").get("developer"));
		assertEquals(Boolean.FALSE, s.grants.get("boesger.codeeditor.read").get("viewer"));
	}

	@Test
	public void merge_whenExistingContent_shouldPreserveNativeAndFlatGrants() throws Exception {
		String existing = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
				+ "<permissions>\n"
				+ "  <role name=\"admin\"><grant permission=\"com.polarion.security.login\"/></role>\n"
				+ "  <role name=\"developer\"><grant permission=\"boesger.codeeditor.read\"/></role>\n"
				+ "</permissions>";

		String xml = merge(existing, sampleSets());

		assertTrue("native permission preserved", xml.contains("com.polarion.security.login"));
		assertTrue("flat code-editor grant preserved", xml.contains("permission=\"boesger.codeeditor.read\""));
		assertTrue("custom set definition written", xml.contains("id=\"cepi-set-abc\""));
		assertTrue("set grant written with @set syntax",
				xml.contains("@cepi-set-abc.boesger.codeeditor.read"));
	}

	@Test
	public void merge_whenReplacingExistingSets_shouldRemoveOldCepiSets() throws Exception {
		String first = merge(null, sampleSets());
		assertTrue(first.contains("cepi-set-abc"));

		CustomSet other = new CustomSet();
		other.id = "cepi-set-xyz";
		other.name = "Other";
		other.filter = "type:requirement";
		other.grants = new LinkedHashMap<>();
		String second = merge(first, java.util.List.of(other));

		assertFalse("old set removed", second.contains("cepi-set-abc"));
		assertTrue("new set present", second.contains("cepi-set-xyz"));
	}

	@Test
	public void merge_whenEmptyList_shouldRemoveAllCepiSets() throws Exception {
		String withSet = merge(null, sampleSets());
		String cleared = merge(withSet, java.util.List.of());

		assertFalse(cleared.contains("cepi-set-abc"));
		assertFalse(cleared.contains("@cepi-set-abc"));
	}
}
