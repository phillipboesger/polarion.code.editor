package biz.avasis.polarion.copilot.api;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import biz.avasis.polarion.core.dao.PolarionDAO;
import biz.avasis.polarion.core.fileeditor.AvasisFile;
import biz.avasis.polarion.core.fileeditor.FileEditorService;
import biz.avasis.polarion.core.logger.AvaLogger;

/**
 * Simple REST servlet for Copilot-specific configuration files.
 * <p>
 * This servlet exposes JSON and XML configuration files stored in the avasis
 * repository (".avasis" folder) via HTTP endpoints.
 * It delegates all file operations to {@link FileEditorService} from the
 * core plugin.
 * </p>
 * <p>
 * Base path (see web.xml mapping):
 * <code>/ava-copilot/api/*</code>
 * </p>
 * Supported patterns:
 * <ul>
 * <li>GET /ava-copilot/api/projects/{projectId}/config/json/{fileName}</li>
 * <li>PUT /ava-copilot/api/projects/{projectId}/config/json/{fileName}</li>
 * <li>GET /ava-copilot/api/projects/{projectId}/config/xml/{fileName}</li>
 * <li>PUT /ava-copilot/api/projects/{projectId}/config/xml/{fileName}</li>
 * </ul>
 */
public class CopilotRestServlet extends HttpServlet {

	private static final long serialVersionUID = 1L;
	private static final String APPLICATION_JSON_UTF8 = "application/json;charset=UTF-8";
	private static final String PROJECT_ID_GLOBAL = "global";

	private static final AvaLogger log = new AvaLogger(CopilotRestServlet.class);

	@Override
	protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException {
		resp.setCharacterEncoding(StandardCharsets.UTF_8.name());

		if(!isAuthorized(resp)) { return; }

		String pathInfo = req.getPathInfo();
		if(pathInfo == null || pathInfo.isBlank()) {
			writeError(resp, HttpServletResponse.SC_BAD_REQUEST, "Missing path");
			return;
		}

		List<String> segments = splitPath(pathInfo);

		// Special case: list all Copilot JSON configuration files
		// Pattern: /projects/{projectId}/config/json
		if(isListJsonConfigsRequest(segments)) {
			String projectIdSegment = segments.get(1);
			String projectId = PROJECT_ID_GLOBAL.equalsIgnoreCase(projectIdSegment) ? null : projectIdSegment;
			handleListJsonConfigs(projectId, resp);
			return;
		}

		// Default: treat as single file access
		ParsedRequest parsed = parsePath(segments, resp);
		if(parsed == null) {
			// parsePath already wrote the response / status
			return;
		}

		try {
			if("img".equals(parsed.format)) {
				serveImage(parsed, resp);
			}
			else {
				serveTextContent(parsed, resp);
			}
		}
		catch(IllegalArgumentException e) {
			log.info("Resource not found or invalid argument: " + e.getMessage());
			writeError(resp, HttpServletResponse.SC_NOT_FOUND, e.getMessage());
		}
		catch(IOException e) {
			log.error("Unexpected error in CopilotRestServlet doGet: " + e.getMessage(), e);
			writeError(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "Internal server error: " + e.getMessage());
		}
	}

	/**
	 * Checks if the current user is authorized to access the resource.
	 *
	 * @param  resp the servlet response
	 * @return      true if authorized, false otherwise (error response written)
	 */
	private boolean isAuthorized(HttpServletResponse resp) {
		try {
			// Check if we can access the security service and get a current user.
			// If not logged in or session invalid, this typically throws an exception or returns null/guest.
			String user = PolarionDAO.getSecurityService().getCurrentUser();
			if(user == null) {
				writeError(resp, HttpServletResponse.SC_UNAUTHORIZED, "Not authorized: No active user session.");
				return false;
			}
			return true;
		}
		catch(Exception e) {
			log.info("Authorization check failed: " + e.getMessage());
			writeError(resp, HttpServletResponse.SC_UNAUTHORIZED, "Not authorized: " + e.getMessage());
			return false;
		}
	}

	/**
	 * Splits the path info into a list of non-empty segments.
	 *
	 * @param  pathInfo the path info string
	 * @return          list of path segments
	 */
	private List<String> splitPath(String pathInfo) {
		String[] rawSegments = pathInfo.split("/");
		List<String> segments = new ArrayList<>();
		for(String s : rawSegments) {
			if(s != null && !s.isBlank()) {
				segments.add(s);
			}
		}
		return segments;
	}

	/**
	 * Checks if the request is for listing JSON configurations.
	 *
	 * @param  segments list of path segments
	 * @return          true if it matches the pattern
	 */
	private boolean isListJsonConfigsRequest(List<String> segments) {
		return segments.size() == 4 && "projects".equalsIgnoreCase(segments.get(0))
				&& "config".equalsIgnoreCase(segments.get(2))
				&& "json".equalsIgnoreCase(segments.get(3));
	}

	/**
	 * Serves an image file (SVG, PNG, JPG, GIF).
	 *
	 * @param  parsed      the parsed request
	 * @param  resp        the servlet response
	 * @throws IOException on I/O error
	 */
	private void serveImage(ParsedRequest parsed, HttpServletResponse resp) throws IOException {
		// Image response: currently optimized for SVG icons which are
		// stored as text in the repository.
		String fileName = parsed.fileName != null ? parsed.fileName.toLowerCase() : "";
		if(fileName.endsWith(".svg")) {
			resp.setContentType("image/svg+xml");
		}
		else if(fileName.endsWith(".png")) {
			resp.setContentType("image/png");
		}
		else if(fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) {
			resp.setContentType("image/jpeg");
		}
		else if(fileName.endsWith(".gif")) {
			resp.setContentType("image/gif");
		}
		else {
			resp.setContentType("application/octet-stream");
		}

		// For now, load as text (sufficient for SVG icons) and
		// write as bytes. If binary formats are needed later, a
		// dedicated binary loader can be introduced.
		String content = FileEditorService.loadFileContent(parsed.projectId, parsed.fileName, null);
		resp.getOutputStream().write(content.getBytes(StandardCharsets.UTF_8));
	}

	/**
	 * Serves text content (JSON, XML).
	 *
	 * @param  parsed      the parsed request
	 * @param  resp        the servlet response
	 * @throws IOException on I/O error
	 */
	private void serveTextContent(ParsedRequest parsed, HttpServletResponse resp) throws IOException {
		String content = FileEditorService.loadFileContent(parsed.projectId, parsed.fileName, null);

		switch (parsed.format) {
			case "json" -> resp.setContentType(APPLICATION_JSON_UTF8);
			case "xml" -> resp.setContentType("application/xml;charset=UTF-8");
			default -> resp.setContentType("text/plain;charset=UTF-8");
		}

		try(PrintWriter writer = resp.getWriter()) {
			writer.write(content);
		}
	}

	@Override
	protected void doPut(HttpServletRequest req, HttpServletResponse resp) throws ServletException {
		resp.setCharacterEncoding(StandardCharsets.UTF_8.name());

		if(!isAuthorized(resp)) { return; }

		String pathInfo = req.getPathInfo();
		if(pathInfo == null || pathInfo.isBlank()) {
			// PUT on empty path is invalid
			return;
		}
		List<String> segments = splitPath(pathInfo);

		ParsedRequest parsed = parsePath(segments, resp);
		if(parsed == null) { return; }

		FileEditorService service = new FileEditorService(parsed.projectId);
		try {
			String body = readRequestBody(req);
			service.updateFile(parsed.fileName, body);
			resp.setStatus(HttpServletResponse.SC_NO_CONTENT);
		}
		catch(Exception e) { // NOSONAR
			log.error("Unexpected error in CopilotRestServlet doPut: " + e.getMessage(), e);
			writeError(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
		}
	}

	/**
	 * Reads the request body as a string.
	 *
	 * @param  req         the servlet request
	 * @return             the body content
	 * @throws IOException on I/O error
	 */
	private static String readRequestBody(HttpServletRequest req) throws IOException {
		StringBuilder sb = new StringBuilder();
		try(BufferedReader reader = req.getReader()) {
			String line;
			while((line = reader.readLine()) != null) {
				sb.append(line).append('\n');
			}
		}
		return sb.toString();
	}

	/**
	 * Writes a JSON error response.
	 *
	 * @param resp    the servlet response
	 * @param status  the HTTP status code
	 * @param message the error message
	 */
	private static void writeError(HttpServletResponse resp, int status, String message) {
		try {
			resp.setStatus(status);
			resp.setContentType(APPLICATION_JSON_UTF8);
			String safeMessage = message != null ? message.replace("\"", "'") : "Unexpected error";
			try(PrintWriter writer = resp.getWriter()) {
				writer.write("{\"error\":\"" + safeMessage + "\"}");
			}
		}
		catch(IOException e) {
			log.error("Failed to write error response: " + e.getMessage(), e);
		}
	}

	/**
	 * Lists all JSON configuration files relevant for the Copilot.
	 * <p>
	 * Currently this returns all <code>.json</code> files located under the
	 * <code>.avasis/avaCopilot</code> folder, taking project-specific overrides
	 * into account (via {@link FileEditorService#getAllConfigurations()}).
	 * The response is a JSON array with objects of the form:
	 * </p>
	 *
	 * <pre>
	 * [
	 *   {"fileName":"avaCopilot/documentCompare.json","projectId":"myProject","global":false},
	 *   {"fileName":"avaCopilot/otherConfig.json","projectId":null,"global":true}
	 * ]
	 * </pre>
	 *
	 * @param projectId current project context or null
	 * @param resp      servlet response
	 */
	private void handleListJsonConfigs(String projectId, HttpServletResponse resp) {
		FileEditorService service = new FileEditorService(projectId);
		try {
			List<AvasisFile> allConfigs = service.getAllConfigurations();
			JsonArray jsonArray = new JsonArray();

			for(AvasisFile file : allConfigs) {
				if(isRelevantConfigFile(file)) {
					String relativePath = extractRelativePath(file);
					if(relativePath != null && !relativePath.isBlank()) {
						jsonArray.add(createConfigJson(file, relativePath));
					}
				}
			}

			resp.setContentType(APPLICATION_JSON_UTF8);
			try(PrintWriter writer = resp.getWriter()) {
				writer.write(new Gson().toJson(jsonArray));
			}
		}
		catch(IOException e) {
			log.error("Unexpected error listing JSON configs: " + e.getMessage(), e);
			writeError(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
		}
	}

	/**
	 * Checks if the file is a relevant configuration file.
	 *
	 * @param  file the file to check
	 * @return      true if relevant
	 */
	private boolean isRelevantConfigFile(AvasisFile file) {
		String name = file.getFileName().toLowerCase();
		String path = file.getLocation().toString();
		return name.endsWith(".json") && path != null && path.contains(".avasis/avaCopilot");
	}

	/**
	 * Extracts the relative path of the file within the .avasis folder.
	 *
	 * @param  file the avasis file
	 * @return      relative path string or null if not found
	 */
	private String extractRelativePath(AvasisFile file) {
		String path = file.getLocation().toString();
		int idx = path.indexOf(FileEditorService.AVASIS_MACRO_FOLDER_NAME + "/");
		if(idx < 0) { return null; }
		String relativePath = path.substring(
				idx + FileEditorService.AVASIS_MACRO_FOLDER_NAME.length() + 1);

		if(relativePath.startsWith("/")) {
			relativePath = relativePath.substring(1);
		}
		int endIdx = relativePath.indexOf(']');
		if(endIdx >= 0) {
			relativePath = relativePath.substring(0, endIdx);
		}
		endIdx = relativePath.indexOf('\'');
		if(endIdx >= 0) {
			relativePath = relativePath.substring(0, endIdx);
		}
		return relativePath;
	}

	/**
	 * Creates a JSON object representing the configuration file.
	 *
	 * @param  file         the avasis file
	 * @param  relativePath the relative path
	 * @return              JSON object
	 */
	private JsonObject createConfigJson(AvasisFile file, String relativePath) {
		JsonObject obj = new JsonObject();
		obj.addProperty("fileName", relativePath);
		obj.addProperty("projectId", file.getProjectId());
		obj.addProperty(PROJECT_ID_GLOBAL, file.hasGlobalScope());
		return obj;
	}

	/**
	 * Parses and validates the request path.
	 *
	 * @param  segments list of path segments
	 * @param  resp     servlet response (for error writing)
	 * @return          parsed request object or null if invalid
	 */
	private ParsedRequest parsePath(List<String> segments, HttpServletResponse resp) {
		// Valid path format: projects / {projectId} / config / {format} / {fileName}
		if(segments.size() < 5) {
			writeError(resp, HttpServletResponse.SC_BAD_REQUEST,
					"Invalid path. Expected /projects/{projectId}/config/{format}/{fileName}");
			return null;
		}

		if(!"projects".equalsIgnoreCase(segments.get(0))) {
			writeError(resp, HttpServletResponse.SC_BAD_REQUEST, "Path must start with /projects");
			return null;
		}

		String projectIdSegment = segments.get(1);
		String configLiteral = segments.get(2);
		String format = segments.get(3).toLowerCase();

		if(!"config".equalsIgnoreCase(configLiteral)) {
			writeError(resp, HttpServletResponse.SC_BAD_REQUEST, "Expected 'config' after project id");
			return null;
		}

		if(!"json".equals(format) && !"xml".equals(format) && !"img".equals(format)) {
			writeError(resp, HttpServletResponse.SC_BAD_REQUEST, "Unsupported format: " + format);
			return null;
		}

		// Join remaining segments as file name (supports nested paths)
		StringBuilder fileNameBuilder = new StringBuilder();
		for(int i = 4; i < segments.size(); i++) {
			if(!fileNameBuilder.isEmpty()) {
				fileNameBuilder.append('/');
			}
			fileNameBuilder.append(segments.get(i));
		}

		// Allow special project id "global" to address only the global
		// .avasis folder (no project-specific scope). In that case we pass
		// null to the FileEditorService which will resolve only against
		// the global .avasis location.
		String projectId = PROJECT_ID_GLOBAL.equalsIgnoreCase(projectIdSegment) ? null : projectIdSegment;

		ParsedRequest parsed = new ParsedRequest();
		parsed.projectId = projectId;
		parsed.format = format;
		parsed.fileName = fileNameBuilder.toString();
		return parsed;
	}

	/**
	 * DTO for parsed request parameters from the path.
	 */
	private static class ParsedRequest {
		String projectId;
		String format;
		String fileName;
	}
}
