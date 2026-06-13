package boesger.polarion.codeeditor.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.StringReader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerException;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;

import com.polarion.core.util.logging.Logger;
import com.polarion.platform.service.repository.IRepositoryReadOnlyConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.subterra.base.location.ILocation;
import com.polarion.subterra.base.location.Location;

import boesger.polarion.codeeditor.exception.CodeEditorException;
import boesger.polarion.codeeditor.util.PolarionUtils;

/**
 * Reads and writes {@code .polarion/security/permissions.xml} in the Polarion SVN repository.
 * <p>
 * Works at global scope (no project context) or project scope when a {@code projectId} is given.
 * Only manages entries for the two Code Editor permissions:
 * {@code boesger.codeeditor.read} and {@code boesger.codeeditor.write}.
 */
public class PermissionsService {

	private static final Logger log = Logger.getLogger(PermissionsService.class.getName());

	/** Relative path to the permissions file inside a project or global Polarion folder. */
	private static final String PERMISSIONS_REL_PATH = ".polarion/security/permissions.xml";

	/** Prefix used for both Code Editor permission IDs. */
	private static final String CEPI_PERMISSION_PREFIX = "boesger.codeeditor.";

	/** Id prefix marking a custom set as owned by the Code Editor plugin. */
	private static final String CEPI_SET_ID_PREFIX = "cepi-";

	/**
	 * Container element for Code Editor custom sets. Plugin-namespaced, non-native tag names are used
	 * deliberately: Polarion's Permissions editor only understands native {@code <customset>} (which
	 * requires an artifact prototype and crashes on anything else), so the sets are stored in elements
	 * Polarion ignores entirely.
	 */
	private static final String CEPI_SETS_TAG = "cepi-customsets";
	private static final String CEPI_SET_TAG = "cepi-set";
	private static final String CEPI_GRANT_TAG = "cepi-grant";

	private final String projectId;

	public PermissionsService(String projectId) {
		this.projectId = (projectId != null && !projectId.isBlank()) ? projectId : null;
	}

	// ── Public API ─────────────────────────────────────────────────────────

	/**
	 * Reads the current Code Editor grants from the persisted permissions.xml.
	 *
	 * @return map of {@code permissionId → { roleName → null|true|false }}
	 */
	public Map<String, Map<String, Boolean>> loadGrants() {
		try {
			String xml = readPermissionsXml();
			if(xml == null) return Collections.emptyMap();
			return parseCepiGrants(xml);
		}
		catch(Exception e) {
			log.warn("Could not load permissions.xml: " + e.getMessage());
			return Collections.emptyMap();
		}
	}

	/**
	 * Persists Code Editor grants into permissions.xml by merging them into the
	 * existing file (or creating a minimal new one when the file does not yet exist).
	 *
	 * @param grants map of {@code permissionId → { roleName → null|true|false }}
	 */
	public void saveGrants(Map<String, Map<String, Boolean>> grants) throws CodeEditorException {
		try {
			String xml = readPermissionsXml();
			String updated = mergeCepiGrants(xml, grants);
			writePermissionsXml(updated);
		}
		catch(CodeEditorException e) {
			throw e;
		}
		catch(Exception e) {
			throw new CodeEditorException("Failed to save permissions: " + e.getMessage(), e);
		}
	}

	/**
	 * Reads the Code Editor custom permission sets persisted in permissions.xml.
	 * A set is a {@code <customset>} whose id starts with {@value #CEPI_SET_ID_PREFIX}, together with
	 * its per-role grants stored as {@code @<setId>.boesger.codeeditor.*} grant/deny entries.
	 *
	 * @return the list of custom sets (never {@code null}; empty when none or on read error)
	 */
	public List<CustomSet> loadCustomSets() {
		try {
			String xml = readPermissionsXml();
			if(xml == null) return new ArrayList<>();
			return parseCustomSets(xml);
		}
		catch(Exception e) {
			log.warn("Could not load custom sets from permissions.xml: " + e.getMessage());
			return new ArrayList<>();
		}
	}

	/**
	 * Persists the Code Editor custom permission sets into permissions.xml, replacing any previously
	 * stored Code Editor sets. Other content (native permissions, flat Code Editor grants) is preserved.
	 *
	 * @param sets the custom sets to store (a {@code null} list is treated as empty)
	 * @throws CodeEditorException if persisting to the repository fails
	 */
	public void saveCustomSets(List<CustomSet> sets) throws CodeEditorException {
		try {
			String xml = readPermissionsXml();
			String updated = mergeCustomSets(xml, sets != null ? sets : new ArrayList<>());
			writePermissionsXml(updated);
		}
		catch(CodeEditorException e) {
			throw e;
		}
		catch(Exception e) {
			throw new CodeEditorException("Failed to save custom sets: " + e.getMessage(), e);
		}
	}

	// ── SVN read / write ────────────────────────────────────────────────────

	private ILocation resolvePermissionsLocation() {
		if(projectId != null) {
			ILocation projectRoot = PolarionUtils.getTrackerProject(projectId).getLocation();
			return projectRoot.append(PERMISSIONS_REL_PATH);
		}
		// Global scope: root of the default repository
		return Location.getLocationWithRepository(IRepositoryService.DEFAULT, "/" + PERMISSIONS_REL_PATH);
	}

	private String readPermissionsXml() throws IOException {
		IRepositoryReadOnlyConnection conn = PolarionUtils.getRepositoryService()
				.getReadOnlyConnection(IRepositoryService.DEFAULT);
		ILocation loc = resolvePermissionsLocation();
		if(!conn.exists(loc)) {
			log.info("[cepi] permissions.xml does not exist at " + loc + " – will create on first save.");
			return null;
		}
		try(var is = conn.getContent(loc)) {
			return new String(is.readAllBytes(), StandardCharsets.UTF_8);
		}
	}

	private void writePermissionsXml(String xml) throws CodeEditorException {
		ILocation loc = resolvePermissionsLocation();
		PolarionUtils.executeInTransactionWithResult(() -> {
			var conn = PolarionUtils.getRepositoryWriteConnection();
			byte[] bytes = xml.getBytes(StandardCharsets.UTF_8);
			if(conn.exists(loc)) {
				conn.setContent(loc, new ByteArrayInputStream(bytes));
			}
			else {
				ILocation parent = loc.getParentLocation();
				if(parent != null && !conn.exists(parent)) {
					conn.makeFolders(parent);
				}
				conn.create(loc, new ByteArrayInputStream(bytes));
			}
			return null;
		});
	}

	// ── XML parsing ─────────────────────────────────────────────────────────

	/**
	 * Parses only the {@code boesger.codeeditor.*} role grants from the XML.
	 * Returns: {@code permId → roleName → Boolean (true=grant, false=deny, null=absent)}.
	 */
	private Map<String, Map<String, Boolean>> parseCepiGrants(String xml)
			throws ParserConfigurationException, SAXException, IOException {

		Document doc = parseDocument(xml);
		Map<String, Map<String, Boolean>> result = new LinkedHashMap<>();

		// <role name="..."> <grant/deny permission="boesger.codeeditor.X"/> </role>
		NodeList roles = doc.getElementsByTagName("role");
		for(int i = 0; i < roles.getLength(); i++) {
			Node roleNode = roles.item(i);
			if(roleNode.getNodeType() == Node.ELEMENT_NODE) {
				Element roleEl = (Element) roleNode;
				String roleName = roleEl.getAttribute("name");
				if(roleName != null && !roleName.isBlank()) {
					collectGrantsFromRole(roleEl, roleName, result);
				}
			}
		}
		return result;
	}

	private void collectGrantsFromRole(Element roleEl, String roleName,
			Map<String, Map<String, Boolean>> out) {
		for(String tag : new String[] { "grant", "deny" }) {
			NodeList nodes = roleEl.getElementsByTagName(tag);
			for(int j = 0; j < nodes.getLength(); j++) {
				Node n = nodes.item(j);
				if(n.getNodeType() == Node.ELEMENT_NODE) {
					String perm = ((Element) n).getAttribute("permission");
					if(perm != null && perm.startsWith(CEPI_PERMISSION_PREFIX)) {
						out.computeIfAbsent(perm, k -> new LinkedHashMap<>())
								.put(roleName, "grant".equals(tag));
					}
				}
			}
		}
	}

	// ── XML merging ─────────────────────────────────────────────────────────

	/**
	 * Merges the provided grants into the existing XML document (or creates a new one),
	 * then serialises back to a well-formatted XML string.
	 */
	private String mergeCepiGrants(String existingXml, Map<String, Map<String, Boolean>> grants)
			throws ParserConfigurationException, SAXException, IOException, TransformerException {

		Document doc;
		Element root;
		if(existingXml != null) {
			doc = parseDocument(existingXml);
			root = doc.getDocumentElement();
		}
		else {
			doc = newDocument();
			root = doc.createElement("permissions");
			doc.appendChild(root);
		}

		// 1. Remove all existing cepi <role> blocks that only contain cepi grants/denies
		removeCepiElements(root);

		// 2. Add a single <role name="..."> block per role that has at least one grant/deny
		Map<String, Map<String, Boolean>> byRole = invertGrants(grants);
		byRole.forEach((roleName, permMap) -> {
			if(permMap.isEmpty()) return;
			Element roleEl = doc.createElement("role");
			roleEl.setAttribute("name", roleName);
			permMap.forEach((permId, value) -> {
				if(value == null) return; // null = not set → omit
				Element entry = doc.createElement(Boolean.TRUE.equals(value) ? "grant" : "deny");
				entry.setAttribute("permission", permId);
				roleEl.appendChild(entry);
			});
			if(roleEl.hasChildNodes()) {
				root.appendChild(doc.createTextNode("\n    "));
				root.appendChild(roleEl);
			}
		});
		root.appendChild(doc.createTextNode("\n"));

		return serialise(doc);
	}

	/**
	 * Removes {@code <role>} elements whose children consist *exclusively* of
	 * cepi permission grants/denies (so we can replace them cleanly).
	 */
	private void removeCepiElements(Element root) {
		NodeList roles = root.getElementsByTagName("role");
		var toRemove = new java.util.ArrayList<Node>();
		for(int i = 0; i < roles.getLength(); i++) {
			Node n = roles.item(i);
			if(n.getNodeType() == Node.ELEMENT_NODE) {
				Element roleEl = (Element) n;
				if(roleEl.getParentNode() == root && hasCepiChildrenOnly(roleEl)) {
					toRemove.add(n);
				}
			}
		}
		for(Node n : toRemove) {
			Node prev = n.getPreviousSibling();
			if(prev != null && prev.getNodeType() == Node.TEXT_NODE) {
				root.removeChild(prev);
			}
			root.removeChild(n);
		}
	}

	/** Returns true when every child grant/deny permission starts with the cepi prefix. */
	private boolean hasCepiChildrenOnly(Element roleEl) {
		NodeList children = roleEl.getChildNodes();
		boolean hasCepi = false;
		for(int i = 0; i < children.getLength(); i++) {
			Node c = children.item(i);
			if(c.getNodeType() == Node.TEXT_NODE) continue;
			if(c.getNodeType() != Node.ELEMENT_NODE) return false;
			String perm = ((Element) c).getAttribute("permission");
			if(perm == null || !perm.startsWith(CEPI_PERMISSION_PREFIX)) return false;
			hasCepi = true;
		}
		return hasCepi;
	}

	/** Flips {@code permId → role → value} to {@code role → permId → value}. */
	private Map<String, Map<String, Boolean>> invertGrants(Map<String, Map<String, Boolean>> grants) {
		Map<String, Map<String, Boolean>> result = new LinkedHashMap<>();
		grants.forEach((permId, roleMap) -> {
			if(roleMap != null) {
				roleMap.forEach((roleName, value) -> result.computeIfAbsent(roleName, k -> new LinkedHashMap<>()).put(permId, value));
			}
		});
		return result;
	}

	// ── XML utilities ────────────────────────────────────────────────────────

	private Document parseDocument(String xml)
			throws ParserConfigurationException, SAXException, IOException {
		DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
		dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
		dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
		dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
		DocumentBuilder db = dbf.newDocumentBuilder();
		return db.parse(new InputSource(new StringReader(xml)));
	}

	private Document newDocument() throws ParserConfigurationException {
		DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
		dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
		return dbf.newDocumentBuilder().newDocument();
	}

	private String serialise(Document doc) throws TransformerException {
		TransformerFactory tf = TransformerFactory.newInstance();
		tf.setAttribute(javax.xml.XMLConstants.ACCESS_EXTERNAL_DTD, "");
		tf.setAttribute(javax.xml.XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "");
		Transformer t = tf.newTransformer();
		t.setOutputProperty(OutputKeys.INDENT, "yes");
		t.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
		t.setOutputProperty(OutputKeys.STANDALONE, "no");
		t.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "4");
		StringWriter sw = new StringWriter();
		t.transform(new DOMSource(doc), new StreamResult(sw));
		return sw.toString();
	}

	// ── Custom set parsing / merging ─────────────────────────────────────────

	/**
	 * Parses the Code Editor custom sets from the plugin's {@code <cepi-customsets>} block.
	 *
	 * @param xml the permissions.xml content
	 * @return the parsed custom sets in document order
	 * @throws ParserConfigurationException if the XML parser cannot be created
	 * @throws SAXException                 if the XML is malformed
	 * @throws IOException                  if reading the XML fails
	 */
	private List<CustomSet> parseCustomSets(String xml)
			throws ParserConfigurationException, SAXException, IOException {
		Document doc = parseDocument(xml);
		List<CustomSet> result = new ArrayList<>();

		NodeList sets = doc.getElementsByTagName(CEPI_SET_TAG);
		for(int i = 0; i < sets.getLength(); i++) {
			Node n = sets.item(i);
			if(n.getNodeType() != Node.ELEMENT_NODE) continue;
			Element el = (Element) n;
			String id = el.getAttribute("id");
			if(id == null || !id.startsWith(CEPI_SET_ID_PREFIX)) continue;
			CustomSet set = new CustomSet();
			set.id = id;
			set.name = el.getAttribute("title");
			set.filter = el.getAttribute("filter");
			set.grants = new LinkedHashMap<>();
			NodeList grants = el.getElementsByTagName(CEPI_GRANT_TAG);
			for(int j = 0; j < grants.getLength(); j++) {
				Node gn = grants.item(j);
				if(gn.getNodeType() != Node.ELEMENT_NODE) continue;
				Element g = (Element) gn;
				String role = g.getAttribute("role");
				String perm = g.getAttribute("perm");
				if(role.isEmpty() || !perm.startsWith(CEPI_PERMISSION_PREFIX)) continue;
				boolean granted = "grant".equals(g.getAttribute("value"));
				set.grants.computeIfAbsent(perm, k -> new LinkedHashMap<>()).put(role, granted);
			}
			result.add(set);
		}
		return result;
	}

	/**
	 * Replaces the Code Editor custom sets in the document with the supplied ones, preserving all other
	 * content, and serialises the result. Sets are stored in a plugin-namespaced {@code <cepi-customsets>}
	 * block (non-native tag names) so Polarion's Permissions editor ignores them — native
	 * {@code <customset>} requires an artifact prototype and crashes the editor otherwise.
	 *
	 * @param existingXml the current permissions.xml, or {@code null} to start a new document
	 * @param sets        the custom sets to write
	 * @return the serialised, updated XML
	 * @throws ParserConfigurationException if the XML parser cannot be created
	 * @throws SAXException                 if the existing XML is malformed
	 * @throws IOException                  if reading the XML fails
	 * @throws TransformerException         if serialisation fails
	 */
	private String mergeCustomSets(String existingXml, List<CustomSet> sets)
			throws ParserConfigurationException, SAXException, IOException, TransformerException {
		Document doc;
		Element root;
		if(existingXml != null) {
			doc = parseDocument(existingXml);
			root = doc.getDocumentElement();
		}
		else {
			doc = newDocument();
			root = doc.createElement("permissions");
			doc.appendChild(root);
		}

		removeCepiCustomSets(root);

		List<CustomSet> valid = new ArrayList<>();
		for(CustomSet set : sets) {
			if(set != null && set.id != null && set.id.startsWith(CEPI_SET_ID_PREFIX)) valid.add(set);
		}
		if(!valid.isEmpty()) {
			Element container = doc.createElement(CEPI_SETS_TAG);
			for(CustomSet set : valid) {
				Element el = doc.createElement(CEPI_SET_TAG);
				el.setAttribute("id", set.id);
				el.setAttribute("title", set.name != null ? set.name : "");
				el.setAttribute("filter", set.filter != null ? set.filter : "");
				if(set.grants != null) {
					set.grants.forEach((permId, roleMap) -> {
						if(roleMap == null) return;
						roleMap.forEach((roleName, value) -> {
							if(value == null) return;
							Element g = doc.createElement(CEPI_GRANT_TAG);
							g.setAttribute("role", roleName);
							g.setAttribute("perm", permId);
							g.setAttribute("value", Boolean.TRUE.equals(value) ? "grant" : "deny");
							el.appendChild(g);
						});
					});
				}
				container.appendChild(el);
			}
			root.appendChild(doc.createTextNode("\n    "));
			root.appendChild(container);
			root.appendChild(doc.createTextNode("\n"));
		}
		return serialise(doc);
	}

	/**
	 * Removes the plugin's {@code <cepi-customsets>} block, and — for migration from the earlier broken
	 * format — any legacy native {@code <customset id="cepi-...">} definitions and their {@code @set}
	 * grants (dropping roles emptied as a result), while leaving all other content untouched.
	 *
	 * @param root the {@code <permissions>} root element
	 */
	private void removeCepiCustomSets(Element root) {
		// Current format: the entire <cepi-customsets> container.
		List<Node> containers = new ArrayList<>();
		NodeList blocks = root.getElementsByTagName(CEPI_SETS_TAG);
		for(int i = 0; i < blocks.getLength(); i++) {
			containers.add(blocks.item(i));
		}
		removeNodesWithLeadingText(containers);

		// Legacy cleanup: native <customset id="cepi-..."> definitions (broke the native editor).
		List<Node> legacySets = new ArrayList<>();
		NodeList sets = root.getElementsByTagName("customset");
		for(int i = 0; i < sets.getLength(); i++) {
			Node n = sets.item(i);
			if(n.getNodeType() == Node.ELEMENT_NODE
					&& ((Element) n).getAttribute("id").startsWith(CEPI_SET_ID_PREFIX)) {
				legacySets.add(n);
			}
		}
		removeNodesWithLeadingText(legacySets);

		// Legacy cleanup: @cepi- grants inside roles; drop roles emptied as a result.
		List<Node> rolesToRemove = new ArrayList<>();
		NodeList roles = root.getElementsByTagName("role");
		for(int i = 0; i < roles.getLength(); i++) {
			Node rn = roles.item(i);
			if(rn.getNodeType() != Node.ELEMENT_NODE) continue;
			Element roleEl = (Element) rn;
			List<Node> grantsToRemove = new ArrayList<>();
			NodeList children = roleEl.getChildNodes();
			for(int j = 0; j < children.getLength(); j++) {
				Node c = children.item(j);
				if(c.getNodeType() != Node.ELEMENT_NODE) continue;
				String perm = ((Element) c).getAttribute("permission");
				if(perm != null && perm.startsWith("@" + CEPI_SET_ID_PREFIX)) {
					grantsToRemove.add(c);
				}
			}
			grantsToRemove.forEach(roleEl::removeChild);
			if(!grantsToRemove.isEmpty() && !hasElementChild(roleEl)) {
				rolesToRemove.add(roleEl);
			}
		}
		removeNodesWithLeadingText(rolesToRemove);
	}

	/**
	 * Returns whether the element has at least one child element.
	 *
	 * @param el the element to inspect
	 * @return {@code true} if the element has an element child
	 */
	private boolean hasElementChild(Element el) {
		NodeList children = el.getChildNodes();
		for(int i = 0; i < children.getLength(); i++) {
			if(children.item(i).getNodeType() == Node.ELEMENT_NODE) return true;
		}
		return false;
	}

	/**
	 * Removes each node together with a preceding whitespace text node, to keep formatting tidy.
	 *
	 * @param nodes the nodes to remove
	 */
	private void removeNodesWithLeadingText(List<Node> nodes) {
		for(Node n : nodes) {
			Node parent = n.getParentNode();
			if(parent == null) continue;
			Node prev = n.getPreviousSibling();
			if(prev != null && prev.getNodeType() == Node.TEXT_NODE) {
				parent.removeChild(prev);
			}
			parent.removeChild(n);
		}
	}

	/** A Code Editor custom permission set: a named, query-defined set with per-role grants. */
	public static class CustomSet {
		/** Set id; always starts with {@value #CEPI_SET_ID_PREFIX}. */
		public String id;
		/** Human-readable set name (stored as the {@code title} attribute). */
		public String name;
		/** Lucene/query filter text defining the set. */
		public String filter;
		/** Per-permission, per-role grants: {@code permId → { role → true|false }}. */
		public Map<String, Map<String, Boolean>> grants;
	}
}
