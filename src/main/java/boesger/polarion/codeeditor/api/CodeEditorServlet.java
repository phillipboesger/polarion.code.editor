package boesger.polarion.codeeditor.api;

// ============================================================================
// DUAL-PLATFORM SERVLET — single javax.servlet source.
//
// This project ships two JARs from this one javax-only source tree: the
// default (Polarion 2606 / Tomcat 11 / jakarta.servlet) build and a
// -pre2606 (Polarion 2512 / Tomcat 9 / javax.servlet) build, produced at
// Maven build time by org.eclipse.transformer:transformer-maven-plugin,
// which rewrites the compiled bytecode's javax.servlet.* references to
// jakarta.servlet.* for the default jar. Do not hand-write a jakarta
// variant of this file — edit only this javax source.
// ============================================================================

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import com.polarion.core.util.logging.Logger;
import com.polarion.platform.core.PlatformContext;
import com.polarion.platform.security.IPermission;
import com.polarion.platform.security.ISecurityService;
import com.polarion.subterra.base.data.identification.ContextId;
import com.polarion.subterra.base.data.identification.IContextId;

import boesger.polarion.codeeditor.exception.CodeEditorException;
import boesger.polarion.codeeditor.model.RepoFile;
import boesger.polarion.codeeditor.security.CodeEditorPermission;
import boesger.polarion.codeeditor.service.CodeEditorService;
import boesger.polarion.codeeditor.service.PermissionsService;

/**
 * HTTP entry point for the Code Editor plugin.
 * Routes GET / PUT / DELETE / POST requests to {@link boesger.polarion.codeeditor.service.CodeEditorService}.
 * <p>
 * Access is enforced with Polarion's native security framework: unauthenticated requests receive
 * HTTP 401, requests from users lacking {@code boesger.codeeditor.read} (for GET) or
 * {@code boesger.codeeditor.write} (for PUT / DELETE / POST) receive HTTP 403. Permission checks
 * are scoped to the request's {@code projectId} (project scope) or the global scope when absent;
 * {@link ISecurityService#hasPermission} resolves grant/deny and project&rarr;global inheritance.
 */
public class CodeEditorServlet extends HttpServlet {

	private static final long serialVersionUID = 1L;
	private static final Logger log = Logger.getLogger(CodeEditorServlet.class.getName());
	private final Gson gson = new GsonBuilder().setPrettyPrinting().create();

	private static final String PARAM_PROJECT_ID = "projectId";
	private static final String PATH_CONFIG_FILE = "/config/file/"; // NOSONAR: Internal servlet routing constant
	private static final String PATH_FILES_TREE = "/files/tree"; // NOSONAR: Internal servlet routing constant
	private static final String PATH_PERMISSIONS = "/permissions"; // NOSONAR: Internal servlet routing constant
	private static final String MSG_PROJECT_ID = " ProjectId: ";
	private static final String MSG_FORBIDDEN_WRITE = "Missing Code Editor write permission";
	private static final String MSG_FORBIDDEN_MANAGE = "Permission management requires administrator rights";
	private static final String ROLE_ADMIN = "admin";
	private static final String ROLE_PROJECT_ADMIN = "project_admin";

	private ISecurityService securityService;
	private IPermission readPermission;
	private IPermission writePermission;

	@Override
	public void init() throws ServletException {
		super.init();
		securityService = PlatformContext.getPlatform().lookupService(ISecurityService.class);
		readPermission = constructPermissionSafely(CodeEditorPermission.PERMISSION_READ);
		writePermission = constructPermissionSafely(CodeEditorPermission.PERMISSION_WRITE);
		log.info("CodeEditorServlet initialized.");
	}

	/**
	 * Constructs a Polarion permission from its id, tolerating an unregistered permission.
	 * Construction succeeds once the permission factory in {@code hivemodule.xml} is loaded; a
	 * {@code null} result (logged as an error) makes {@link #hasPermission} deny access (fail closed).
	 *
	 * @param permissionId the fully qualified permission id, never {@code null}
	 * @return the constructed permission, or {@code null} if no factory is registered for it
	 */
	private IPermission constructPermissionSafely(String permissionId) {
		try {
			return securityService.constructPermission(permissionId);
		}
		catch(RuntimeException e) {
			log.error("Could not construct permission '" + permissionId
					+ "'. Is the permission factory registered in hivemodule.xml? Access will be denied.", e);
			return null;
		}
	}

	/**
	 * Checks whether the current user holds the given permission in the relevant scope.
	 * The check uses the project context when {@code projectId} is present and the global context
	 * otherwise; Polarion resolves project&rarr;global inheritance and grant/deny internally, so a
	 * single call is authoritative (a project-scope deny is not re-granted by the global scope).
	 *
	 * @param permission the permission to check; {@code null} (unregistered) always denies
	 * @param projectId  the project id for project scope, or {@code null}/empty for global scope
	 * @return {@code true} if the permission is granted in the resolved scope, {@code false} otherwise
	 */
	private boolean hasPermission(IPermission permission, String projectId) {
		if(permission == null) {
			return false;
		}
		IContextId contextId = (projectId != null && !projectId.isEmpty())
				? ContextId.getContextIdFromContext(projectId)
				: ContextId.getGlobalContextId();
		try {
			return securityService.hasPermission(permission, contextId);
		}
		catch(RuntimeException e) {
			log.error("Permission check failed for context '" + contextId + "'. Access denied.", e);
			return false;
		}
	}

	/**
	 * Reads the current Code Editor grants for the scope and writes them as JSON.
	 * Backs the Permissions-editor injection; requires permission-management rights (else 403).
	 *
	 * @param projectId the project scope, or {@code null}/empty for global scope
	 * @param resp      the response to write the grants JSON to
	 * @throws IOException if writing the response fails
	 */
	private void handleGetPermissions(String projectId, HttpServletResponse resp) throws IOException {
		if(!canManagePermissions(projectId)) {
			sendErrorSafely(resp, HttpServletResponse.SC_FORBIDDEN, MSG_FORBIDDEN_MANAGE);
			return;
		}
		PermissionsService svc = new PermissionsService(projectId);
		Map<String, Object> result = new HashMap<>();
		result.put("grants", svc.loadGrants());
		result.put("customSets", svc.loadCustomSets());
		sendJson(resp, gson.toJson(result));
	}

	/**
	 * Persists Code Editor grants supplied as JSON into the scope's permissions.xml.
	 * Requires permission-management rights in the relevant scope (else 403).
	 *
	 * @param req       the request whose body holds {@code {"grants": {permId: {role: bool}}}}
	 * @param projectId the project scope, or {@code null}/empty for global scope
	 * @param resp      the response to confirm the save on
	 * @throws IOException         if reading the body or writing the response fails
	 * @throws CodeEditorException if persisting to the repository fails
	 */
	private void handlePostPermissions(HttpServletRequest req, String projectId, HttpServletResponse resp)
			throws IOException, CodeEditorException {
		if(!canManagePermissions(projectId)) {
			sendErrorSafely(resp, HttpServletResponse.SC_FORBIDDEN, MSG_FORBIDDEN_MANAGE);
			return;
		}
		String body = new String(req.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
		GrantsRequest grantsReq = gson.fromJson(body, new TypeToken<GrantsRequest>() {
		}.getType());
		if(grantsReq == null || grantsReq.grants == null) {
			sendErrorSafely(resp, HttpServletResponse.SC_BAD_REQUEST, "Missing grants");
			return;
		}
		PermissionsService svc = new PermissionsService(projectId);
		svc.saveGrants(grantsReq.grants);
		svc.saveCustomSets(grantsReq.customSets);
		sendJson(resp, "{\"status\":\"saved\"}");
	}

	/**
	 * Checks whether the current user may manage Code Editor grants in the given scope.
	 * Editing grants is an administrative action, so this requires the global {@code admin}
	 * role, or the {@code project_admin} / {@code admin} role within the project scope.
	 *
	 * @param projectId the project scope, or {@code null}/empty for global scope
	 * @return {@code true} if the current user may manage permissions in that scope
	 */
	private boolean canManagePermissions(String projectId) {
		String user = securityService.getCurrentUser();
		if(user == null) {
			return false;
		}
		try {
			if(securityService.getRolesForUser(user, ContextId.getGlobalContextId()).contains(ROLE_ADMIN)) {
				return true;
			}
			if(projectId != null && !projectId.isEmpty()) {
				var roles = securityService.getRolesForUser(user, ContextId.getContextIdFromContext(projectId));
				return roles.contains(ROLE_PROJECT_ADMIN) || roles.contains(ROLE_ADMIN);
			}
			return false;
		}
		catch(RuntimeException e) {
			log.error("Could not resolve roles for permission management; denying.", e);
			return false;
		}
	}

	@Override
	protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
		String pathInfo = req.getPathInfo();
		String projectId = req.getParameter(PARAM_PROJECT_ID);

		log.info("GET Request: " + pathInfo + MSG_PROJECT_ID + projectId);

		if(securityService.getCurrentUser() == null) {
			sendErrorSafely(resp, HttpServletResponse.SC_UNAUTHORIZED, "User not authenticated");
			return;
		}

		if(!"/health".equals(pathInfo) && !PATH_PERMISSIONS.equals(pathInfo) && !hasPermission(readPermission, projectId)) {
			sendErrorSafely(resp, HttpServletResponse.SC_FORBIDDEN, "Missing Code Editor read permission");
			return;
		}

		try {
			if("/health".equals(pathInfo)) {
				sendResponse(resp, "OK", 200);
			}
			else if(PATH_PERMISSIONS.equals(pathInfo)) {
				handleGetPermissions(projectId, resp);
			}
			else if("/config/list".equals(pathInfo)) {
				handleListConfigs(projectId, resp);
			}
			else if(pathInfo != null && pathInfo.startsWith(PATH_CONFIG_FILE)) {
				String fileName = pathInfo.substring(PATH_CONFIG_FILE.length());
				boolean forceDownload = "true".equalsIgnoreCase(req.getParameter("download"));
				handleGetFile(projectId, fileName, forceDownload, resp);
			}
			else if(PATH_FILES_TREE.equals(pathInfo)) {
				String path = req.getParameter("path");
				handleFilesTree(projectId, path, resp);
			}
			else {
				sendErrorSafely(resp, HttpServletResponse.SC_NOT_FOUND, "Endpoint not found");
			}
		}
		catch(IOException e) {
			log.error("Error in GET " + pathInfo + ": " + e);
			resp.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
			sendJsonSafely(resp, "{\"error\": \"" + e.getMessage() + "\"}");
		}
	}

	@Override
	protected void doPut(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
		String pathInfo = req.getPathInfo();
		String projectId = req.getParameter(PARAM_PROJECT_ID);

		log.info("PUT Request: " + pathInfo + MSG_PROJECT_ID + projectId);

		if(securityService.getCurrentUser() == null) {
			sendErrorSafely(resp, HttpServletResponse.SC_UNAUTHORIZED);
			return;
		}

		if(!hasPermission(writePermission, projectId)) {
			sendErrorSafely(resp, HttpServletResponse.SC_FORBIDDEN, "Missing Code Editor write permission");
			return;
		}

		try {
			if(pathInfo != null && pathInfo.startsWith(PATH_CONFIG_FILE)) {
				String fileName = pathInfo.substring(PATH_CONFIG_FILE.length());
				String content = new String(req.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
				handleUpdateFile(projectId, fileName, content, resp);
			}
			else {
				sendErrorSafely(resp, HttpServletResponse.SC_NOT_FOUND);
			}
		}
		catch(CodeEditorException | IOException e) {
			log.error("Error in PUT " + pathInfo + ": " + e);
			sendErrorSafely(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
		}
	}

	@Override
	protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
		String pathInfo = req.getPathInfo();
		String projectId = req.getParameter(PARAM_PROJECT_ID);

		log.info("DELETE Request: " + pathInfo + MSG_PROJECT_ID + projectId);

		if(securityService.getCurrentUser() == null) {
			sendErrorSafely(resp, HttpServletResponse.SC_UNAUTHORIZED);
			return;
		}

		if(!hasPermission(writePermission, projectId)) {
			sendErrorSafely(resp, HttpServletResponse.SC_FORBIDDEN, "Missing Code Editor write permission");
			return;
		}

		try {
			if(pathInfo != null && pathInfo.startsWith(PATH_CONFIG_FILE)) {
				String fileName = pathInfo.substring(PATH_CONFIG_FILE.length());
				handleDeleteFile(projectId, fileName, resp);
			}
			else {
				sendErrorSafely(resp, HttpServletResponse.SC_NOT_FOUND);
			}
		}
		catch(CodeEditorException | IOException e) {
			log.error("Error in DELETE " + pathInfo + ": " + e);
			sendErrorSafely(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
		}
	}

	@Override
	protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
		String pathInfo = req.getPathInfo();
		String projectId = req.getParameter(PARAM_PROJECT_ID);

		if(securityService.getCurrentUser() == null) {
			sendErrorSafely(resp, HttpServletResponse.SC_UNAUTHORIZED);
			return;
		}

		if(!PATH_PERMISSIONS.equals(pathInfo) && !hasPermission(writePermission, projectId)) {
			sendErrorSafely(resp, HttpServletResponse.SC_FORBIDDEN, MSG_FORBIDDEN_WRITE);
			return;
		}

		try {
			if(PATH_PERMISSIONS.equals(pathInfo)) {
				handlePostPermissions(req, projectId, resp);
			}
			else if("/config/rename".equals(pathInfo)) {
				handlePostRename(req, projectId, resp);
			}
			else {
				sendErrorSafely(resp, HttpServletResponse.SC_NOT_FOUND);
			}
		}
		catch(CodeEditorException | IOException e) {
			log.error("Error in POST " + pathInfo + ": " + e);
			sendErrorSafely(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
		}
	}

	private void handlePostRename(HttpServletRequest req, String projectId, HttpServletResponse resp)
			throws IOException, CodeEditorException {
		String body = new String(req.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
		RenameRequest renameReq = gson.fromJson(body, RenameRequest.class);

		if(renameReq == null || renameReq.oldName == null || renameReq.newName == null) {
			sendErrorSafely(resp, HttpServletResponse.SC_BAD_REQUEST, "Missing oldName or newName");
			return;
		}

		handleRenameFile(projectId, renameReq.oldName, renameReq.newName, resp);
	}

	private void handleListConfigs(String projectId, HttpServletResponse resp) throws IOException {
		CodeEditorService editor = new CodeEditorService(projectId);
		List<RepoFile> files = editor.getAllFiles();
		List<Map<String, String>> result = files.stream().map(f -> {
			Map<String, String> m = new HashMap<>();
			m.put("name", f.getFileName());
			return m;
		}).collect(Collectors.toList());
		sendJson(resp, gson.toJson(result));
	}

	private void handleFilesTree(String projectId, String path, HttpServletResponse resp) throws IOException {
		CodeEditorService editor = new CodeEditorService(projectId);
		List<Map<String, String>> entries = editor.getDirectoryEntries(path);
		sendJson(resp, gson.toJson(entries));
	}

	private void handleGetFile(String projectId, String fileName, boolean forceDownload, HttpServletResponse resp) throws IOException {
		CodeEditorService editor = new CodeEditorService(projectId);
		String baseName = fileName.contains("/") ? fileName.substring(fileName.lastIndexOf('/') + 1) : fileName;
		String mimeType = getImageMimeType(fileName);
		if(mimeType != null) {
			byte[] bytes = editor.getFileBytes(fileName);
			resp.setContentType(mimeType);
			resp.setContentLength(bytes.length);
			if(forceDownload) {
				resp.setHeader("Content-Disposition", "attachment; filename=\"" + baseName + "\"");
			}
			resp.getOutputStream().write(bytes);
			return;
		}
		RepoFile file = editor.getFile(fileName);
		resp.setContentType("text/plain");
		resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
		if(forceDownload) {
			resp.setHeader("Content-Disposition", "attachment; filename=\"" + baseName + "\"");
		}
		resp.getWriter().write(file.getContent());
	}

	/** Returns the MIME type for known image extensions, or {@code null} for non-image files. */
	private static String getImageMimeType(String fileName) {
		if(fileName == null) return null;
		int dot = fileName.lastIndexOf('.');
		if(dot < 0) return null;
		return switch (fileName.substring(dot + 1).toLowerCase()) {
			case "png" -> "image/png";
			case "jpg", "jpeg" -> "image/jpeg";
			case "gif" -> "image/gif";
			case "svg" -> "image/svg+xml";
			case "webp" -> "image/webp";
			case "bmp" -> "image/bmp";
			case "ico" -> "image/x-icon";
			default -> null;
		};
	}

	private void handleUpdateFile(String projectId, String fileName, String content, HttpServletResponse resp)
			throws IOException, CodeEditorException {
		CodeEditorService editor = new CodeEditorService(projectId);
		editor.updateFile(fileName, content);
		sendResponse(resp, "File updated", 200);
	}

	private void handleDeleteFile(String projectId, String fileName, HttpServletResponse resp) throws IOException, CodeEditorException {
		CodeEditorService editor = new CodeEditorService(projectId);
		boolean deleted = editor.deleteFile(fileName);
		if(deleted) {
			sendResponse(resp, "{\"status\": \"deleted\"}", 200);
		}
		else {
			resp.setStatus(HttpServletResponse.SC_NOT_FOUND);
			sendJson(resp, "{\"error\": \"File not found or could not be deleted\"}");
		}
	}

	private void handleRenameFile(String projectId, String oldName, String newName, HttpServletResponse resp) throws IOException, CodeEditorException {
		CodeEditorService editor = new CodeEditorService(projectId);
		editor.renameFile(oldName, newName);
		sendResponse(resp, "{\"status\": \"renamed\"}", 200);
	}

	private void sendErrorSafely(HttpServletResponse resp, int code) {
		try {
			resp.sendError(code);
		}
		catch(IOException ioEx) {
			log.error("Failed to send error response: " + code + ": " + ioEx);
		}
	}

	private void sendErrorSafely(HttpServletResponse resp, int code, String message) {
		try {
			resp.sendError(code, message);
		}
		catch(IOException ioEx) {
			log.error("Failed to send error response: " + code + ": " + ioEx);
		}
	}

	private void sendJsonSafely(HttpServletResponse resp, String json) {
		try {
			sendJson(resp, json);
		}
		catch(IOException ioEx) {
			log.error("Error sending JSON error response: " + ioEx);
		}
	}

	private void sendJson(HttpServletResponse resp, String json) throws IOException {
		resp.setContentType("application/json");
		resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
		PrintWriter out = resp.getWriter();
		out.print(json);
		out.flush();
	}

	private void sendResponse(HttpServletResponse resp, String message, int status) throws IOException {
		resp.setStatus(status);
		resp.getWriter().write(message);
	}

	private static class RenameRequest {
		String oldName;
		String newName;
	}

	/** Request body for {@code POST /permissions}: grants plus optional custom sets. */
	private static class GrantsRequest {
		Map<String, Map<String, Boolean>> grants;
		List<PermissionsService.CustomSet> customSets;
	}
}
