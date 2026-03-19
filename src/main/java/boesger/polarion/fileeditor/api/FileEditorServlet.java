package boesger.polarion.fileeditor.api;

import java.io.IOException;
import java.io.PrintWriter;
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
import com.polarion.platform.core.PlatformContext;
import com.polarion.platform.security.ISecurityService;

import boesger.polarion.fileeditor.core.fileeditor.FileEditorService;
import boesger.polarion.fileeditor.core.fileeditor.RepoFile;
import boesger.polarion.fileeditor.core.logger.PluginLogger;

/**
 * Generic Servlet for Polarion File Editor.
 * Handles file management operations in the Polarion repository.
 */
public class FileEditorServlet extends HttpServlet {

	private static final long serialVersionUID = 1L;
	private static final PluginLogger log = new PluginLogger(FileEditorServlet.class);
	private final Gson gson = new GsonBuilder().setPrettyPrinting().create();

	private static final String PARAM_PROJECT_ID = "projectId";
	private static final String PATH_CONFIG_FILE = "/config/file/";
	private static final String MSG_PROJECT_ID = " ProjectId: ";

	private ISecurityService securityService;

	@Override
	public void init() throws ServletException {
		super.init();
		securityService = PlatformContext.getPlatform().lookupService(ISecurityService.class);
		log.info("FileEditorServlet initialized.");
	}

	@Override
	protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
		String pathInfo = req.getPathInfo();
		String projectId = req.getParameter(PARAM_PROJECT_ID);

		log.info("GET Request: " + pathInfo + MSG_PROJECT_ID + projectId);

		if(securityService.getCurrentUser() == null) {
			resp.sendError(HttpServletResponse.SC_UNAUTHORIZED, "User not authenticated");
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
			else {
				resp.sendError(HttpServletResponse.SC_NOT_FOUND, "Endpoint not found");
			}
		}
		catch(Exception e) {
			log.error("Error in GET " + pathInfo, e);
			resp.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
			try {
				sendJson(resp, "{\"error\": \"" + e.getMessage() + "\"}");
			}
			catch(IOException ioException) {
				log.error("Error sending JSON error response", ioException);
			}
		}
	}

	@Override
	protected void doPut(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
		String pathInfo = req.getPathInfo();
		String projectId = req.getParameter(PARAM_PROJECT_ID);

		log.info("PUT Request: " + pathInfo + MSG_PROJECT_ID + projectId);

		if(securityService.getCurrentUser() == null) {
			resp.sendError(HttpServletResponse.SC_UNAUTHORIZED);
			return;
		}

		try {
			if(pathInfo != null && pathInfo.startsWith(PATH_CONFIG_FILE)) {
				String fileName = pathInfo.substring(PATH_CONFIG_FILE.length());
				String content = IOUtils.toString(req.getInputStream(), "UTF-8");
				handleUpdateFile(projectId, fileName, content, resp);
			}
			else {
				resp.sendError(HttpServletResponse.SC_NOT_FOUND);
			}
		}
		catch(Exception e) {
			log.error("Error in PUT " + pathInfo, e);
			resp.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
		}
	}

	@Override
	protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
		String pathInfo = req.getPathInfo();
		String projectId = req.getParameter(PARAM_PROJECT_ID);

		log.info("DELETE Request: " + pathInfo + MSG_PROJECT_ID + projectId);

		if(securityService.getCurrentUser() == null) {
			resp.sendError(HttpServletResponse.SC_UNAUTHORIZED);
			return;
		}

		try {
			if(pathInfo != null && pathInfo.startsWith(PATH_CONFIG_FILE)) {
				String fileName = pathInfo.substring(PATH_CONFIG_FILE.length());
				handleDeleteFile(projectId, fileName, resp);
			}
			else {
				resp.sendError(HttpServletResponse.SC_NOT_FOUND);
			}
		}
		catch(Exception e) {
			log.error("Error in DELETE " + pathInfo, e);
			resp.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
		}
	}

	@Override
	protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
		String pathInfo = req.getPathInfo();
		String projectId = req.getParameter(PARAM_PROJECT_ID);

		if(securityService.getCurrentUser() == null) {
			resp.sendError(HttpServletResponse.SC_UNAUTHORIZED);
			return;
		}

		try {
			if("/config/rename".equals(pathInfo)) {
				String body = IOUtils.toString(req.getInputStream(), "UTF-8");
				RenameRequest renameReq = gson.fromJson(body, RenameRequest.class);

				if(renameReq == null || renameReq.oldName == null || renameReq.newName == null) {
					resp.sendError(HttpServletResponse.SC_BAD_REQUEST, "Missing oldName or newName");
					return;
				}

				handleRenameFile(projectId, renameReq.oldName, renameReq.newName, resp);
			}
			else {
				resp.sendError(HttpServletResponse.SC_NOT_FOUND);
			}
		}
		catch(Exception e) {
			log.error("Error in POST " + pathInfo, e);
			resp.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
		}
	}

	private void handleListConfigs(String projectId, HttpServletResponse resp) throws IOException {
		FileEditorService editor = new FileEditorService(projectId);
		List<RepoFile> files = editor.getAllConfigurations();
		List<Map<String, String>> result = files.stream().map(f -> {
			Map<String, String> m = new HashMap<>();
			m.put("name", f.getFileName());
			return m;
		}).collect(Collectors.toList());
		sendJson(resp, gson.toJson(result));
	}

	private void handleGetFile(String projectId, String fileName, HttpServletResponse resp) throws Exception {
		FileEditorService editor = new FileEditorService(projectId);
		RepoFile file = editor.getFile(fileName);
		resp.setContentType("text/plain");
		resp.setCharacterEncoding("UTF-8");
		resp.getWriter().write(file.getContent());
	}

	private void handleUpdateFile(String projectId, String fileName, String content, HttpServletResponse resp)
			throws Exception {
		FileEditorService editor = new FileEditorService(projectId);
		editor.updateFile(fileName, content);
		sendResponse(resp, "File updated", 200);
	}

	private void handleDeleteFile(String projectId, String fileName, HttpServletResponse resp) throws Exception {
		FileEditorService editor = new FileEditorService(projectId);
		boolean deleted = editor.deleteFile(fileName);
		if(deleted) {
			sendResponse(resp, "{\"status\": \"deleted\"}", 200);
		}
		else {
			resp.setStatus(HttpServletResponse.SC_NOT_FOUND);
			sendJson(resp, "{\"error\": \"File not found or could not be deleted\"}");
		}
	}

	private void handleRenameFile(String projectId, String oldName, String newName, HttpServletResponse resp) throws Exception {
		FileEditorService editor = new FileEditorService(projectId);
		try {
			editor.renameFile(oldName, newName);
			sendResponse(resp, "{\"status\": \"renamed\"}", 200);
		}
		catch(Exception e) {
			log.error("Rename failed", e);
			resp.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
			sendJson(resp, "{\"error\": \"" + e.getMessage() + "\"}");
		}
	}

	private void sendJson(HttpServletResponse resp, String json) throws IOException {
		resp.setContentType("application/json");
		resp.setCharacterEncoding("UTF-8");
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
