package boesger.polarion.codeeditor.api;

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

import org.apache.commons.io.IOUtils;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.polarion.core.util.logging.Logger;
import com.polarion.platform.core.PlatformContext;
import com.polarion.platform.security.IPermission;
import com.polarion.platform.security.ISecurityService;

import boesger.polarion.codeeditor.exception.CodeEditorException;
import boesger.polarion.codeeditor.model.RepoFile;
import boesger.polarion.codeeditor.service.CodeEditorService;

/**
 * HTTP entry point for the Code Editor plugin.
 * Routes GET / PUT / DELETE / POST requests to {@link boesger.polarion.codeeditor.service.CodeEditorService}.
 * All endpoints require an authenticated Polarion session; unauthenticated requests receive HTTP 401.
 */
public class CodeEditorServlet extends HttpServlet {

	private static final long serialVersionUID = 1L;
	private static final Logger log = Logger.getLogger(CodeEditorServlet.class.getName());
	private final Gson gson = new GsonBuilder().setPrettyPrinting().create();

	private static final String PARAM_PROJECT_ID = "projectId";
	private static final String PATH_CONFIG_FILE = "/config/file/"; // NOSONAR: Internal servlet routing constant
	private static final String PATH_FILES_TREE = "/files/tree"; // NOSONAR: Internal servlet routing constant
	private static final String MSG_PROJECT_ID = " ProjectId: ";

	private ISecurityService securityService;
	private IPermission readPermission;
	private IPermission writePermission;

	@Override
	public void init() throws ServletException {
		super.init();
		securityService = PlatformContext.getPlatform().lookupService(ISecurityService.class);
		readPermission = constructPermissionSafely("boesger.codeeditor.read");
		writePermission = constructPermissionSafely("boesger.codeeditor.write");
		log.info("CodeEditorServlet initialized.");
	}

	private IPermission constructPermissionSafely(String permissionId) {
		try {
			return securityService.constructPermission(permissionId);
		}
		catch(IllegalArgumentException e) {
			log.warn("Unknown permission id: " + permissionId + ". Falling back to admin-role checks only.");
			log.warn(e.toString());
			return null;
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

		try {
			if("/health".equals(pathInfo)) {
				sendResponse(resp, "OK", 200);
			}
			else if("/config/list".equals(pathInfo)) {
				handleListConfigs(projectId, resp);
			}
			else if(pathInfo != null && pathInfo.startsWith(PATH_CONFIG_FILE)) {
				String fileName = pathInfo.substring(PATH_CONFIG_FILE.length());
				handleGetFile(projectId, fileName, resp);
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

		try {
			if(pathInfo != null && pathInfo.startsWith(PATH_CONFIG_FILE)) {
				String fileName = pathInfo.substring(PATH_CONFIG_FILE.length());
				String content = IOUtils.toString(req.getInputStream(), StandardCharsets.UTF_8);
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

		try {
			if("/config/rename".equals(pathInfo)) {
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
		String body = IOUtils.toString(req.getInputStream(), StandardCharsets.UTF_8);
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

	private void handleGetFile(String projectId, String fileName, HttpServletResponse resp) throws IOException {
		CodeEditorService editor = new CodeEditorService(projectId);
		String mimeType = getImageMimeType(fileName);
		if(mimeType != null) {
			byte[] bytes = editor.getFileBytes(fileName);
			resp.setContentType(mimeType);
			resp.setContentLength(bytes.length);
			resp.getOutputStream().write(bytes);
			return;
		}
		RepoFile file = editor.getFile(fileName);
		resp.setContentType("text/plain");
		resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
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
}
