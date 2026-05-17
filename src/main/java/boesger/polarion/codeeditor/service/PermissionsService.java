package boesger.polarion.codeeditor.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.StringReader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
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
}
