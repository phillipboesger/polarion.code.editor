package boesger.polarion.copilot.core.fileeditor;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.apache.commons.io.IOUtils;

import com.google.gson.Gson;
import com.polarion.platform.repository.config.RepositoryConfigurationException;
import com.polarion.platform.service.repository.IRepositoryReadOnlyConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.subterra.base.location.ILocation;
import com.polarion.subterra.base.location.Location;

import boesger.polarion.copilot.core.fileeditor.actions.CopyFileAction;
import boesger.polarion.copilot.core.fileeditor.actions.DeleteFileAction;
import boesger.polarion.copilot.core.fileeditor.actions.RenameFileAction;
import boesger.polarion.copilot.core.fileeditor.actions.SaveFileAction;
import boesger.polarion.copilot.core.logger.CopilotLogger;
import boesger.polarion.copilot.utils.PolarionUtils;

public class FileEditorService {

	private static final CopilotLogger log = new CopilotLogger(FileEditorService.class);
	private static final String SEARCH_PATH = ".copilot";

	private String projectId = null;
	private final IRepositoryReadOnlyConnection repoConnection;

	public FileEditorService(String projectId) {
		this.projectId = Objects.nonNull(projectId) && !projectId.isBlank() ? projectId : null;
		this.repoConnection = PolarionUtils.getRepositoryService().getReadOnlyConnection(IRepositoryService.DEFAULT);
	}

	public List<RepoFile> getAllMacros() {
		return getFiles(".vm");
	}

	public List<RepoFile> getAllConfigurations() {
		return getFiles(".json");
	}

	public RepoFile getFile(String fileName)
			throws RepositoryConfigurationException, IllegalArgumentException, IOException {
		return loadRepoFileForLocation(projectId, getFileRepoLocation(projectId, fileName), fileName, true);
	}

	public Boolean copyFile(String currentFileName, String newFileName) throws Exception {
		ILocation currentFileLocation = getFileRepoLocation(this.projectId, currentFileName);
		ILocation newFileLocation = resolveTargetLocation(this.projectId, newFileName);

		return PolarionUtils.executeInTransactionWithResult(new CopyFileAction(currentFileLocation, newFileLocation));
	}

	public void renameFile(String currentFileName, String newFileName) throws Exception {
		ILocation currentFileLocation = getFileRepoLocation(this.projectId, currentFileName);
		ILocation newFileLocation = resolveTargetLocation(this.projectId, newFileName);

		if(repoConnection.exists(newFileLocation)) { throw new CopilotFileException(String.format("A file with the new name '%s' exists already!", newFileName)); }

		PolarionUtils.executeInTransaction(new RenameFileAction(currentFileLocation, newFileLocation));
	}

	public Boolean createFile(String fileName, String content) throws Exception {
		ILocation newFileLocation = resolveTargetLocation(this.projectId, fileName);

		if(repoConnection.exists(newFileLocation)) { throw new CopilotFileException(String.format("A file with the name '%s' exists already!", fileName)); }

		return PolarionUtils.executeInTransactionWithResult(new SaveFileAction(newFileLocation, content));
	}

	public Boolean saveFile(String fileName, String content) throws Exception {
		ILocation fileLocation = getFileRepoLocation(this.projectId, fileName);
		return PolarionUtils.executeInTransactionWithResult(new SaveFileAction(fileLocation, content));
	}

	public boolean deleteFile(String fileName) throws Exception {
		ILocation fileLocation = getFileRepoLocation(this.projectId, fileName);
		return PolarionUtils.executeInTransactionWithResult(new DeleteFileAction(fileLocation));
	}

	public void updateFile(String fileName, String content) throws Exception {
		try {
			createFile(fileName, content);
		}
		catch(CopilotFileException e) {
			if(!Objects.equals(getFile(fileName).getContent(), content)) {
				saveFile(fileName, content);
			}
		}
	}

	public String loadFileContent(String fileName) throws IllegalArgumentException, IOException {
		return loadFileContent(this.projectId, fileName, null);
	}

	private ILocation getFileRepoLocation(String projectId, String fileName)
			throws RepositoryConfigurationException, IllegalArgumentException {

		// Check if filename is already a path?
		// We try to resolve it relative to Project or Global root.

		ILocation globalLocation = Location.getLocation(fileName.startsWith("/") ? fileName : "/" + fileName);

		ILocation projectLocation = null;
		if(Objects.nonNull(projectId)) {
			projectLocation = PolarionUtils.getTrackerProject(projectId).getLocation().append(fileName);
		}

		// Priority: Project then Global
		if(Objects.nonNull(projectLocation) && repoConnection.exists(projectLocation)) {
			return projectLocation;
		}
		else if(repoConnection.exists(globalLocation)) {
			return globalLocation;
		}
		else {
			// Fallback for creation or not found error
			if(Objects.nonNull(projectId)) {
				return projectLocation;
			}
			else {
				return globalLocation;
			}
		}
	}

	public String loadFileContent(String projectId, String fileName, String revision)
			throws IllegalArgumentException, IOException {
		ILocation fileLocation = getFileRepoLocation(projectId, fileName);
		if(Objects.nonNull(revision) && !revision.isBlank()) {
			fileLocation = fileLocation.setRevision(revision);
		}
		return loadFileContent(fileLocation);
	}

	public boolean existsFileInRepo(String projectId, String fileName) {
		try {
			ILocation loc = getFileRepoLocation(projectId, fileName);
			return repoConnection.exists(loc);
		}
		catch(Exception e) {
			return false;
		}
	}

	public String loadFileContent(ILocation fileLocation) throws IllegalArgumentException, IOException {
		StringWriter writer = new StringWriter();
		try(InputStream fileContent = repoConnection.getContent(fileLocation)) {
			IOUtils.copy(fileContent, writer, StandardCharsets.UTF_8);
		}
		return writer.toString();
	}

	private List<RepoFile> getFiles(String extension) {
		List<RepoFile> files = new ArrayList<>();

		// 1. Load project files (relative path)
		if(hasProjectScope()) {
			ILocation projLoc = PolarionUtils.getTrackerProject(projectId).getLocation();
			ILocation searchLoc = projLoc.append(SEARCH_PATH);
			files.addAll(loadFilesFromLocation(searchLoc, extension, projectId, projLoc));
		}

		// 2. Load global files (full path from root) -> Use default repo explicitly
		ILocation globalRoot = Location.getLocationWithRepository(IRepositoryService.DEFAULT, "/");
		ILocation globalSearchLoc = globalRoot.append(SEARCH_PATH);
		List<RepoFile> globalFiles = loadFilesFromLocation(globalSearchLoc, extension, null, globalRoot);

		// 2.5 Load additional folders from configuration
		List<String> additionalFolders = getAdditionalFolders();
		for(String folder : additionalFolders) {
			if(folder == null || folder.trim().isEmpty()) continue;

			// Determine context (Project or Global)
			ILocation root = hasProjectScope() ? PolarionUtils.getTrackerProject(projectId).getLocation() : globalRoot;
			ILocation searchLoc = root.append(folder);

			// We use the root as relative base to preserve folder structure in the path
			List<RepoFile> addFiles = loadFilesFromLocation(searchLoc, extension, hasProjectScope() ? projectId : null, root);

			// Identify if files are global or project for deduplication logic?
			// For simplicity: add to files if project scope, else to globalFiles
			if(hasProjectScope()) {
				files.addAll(addFiles);
			}
			else {
				globalFiles.addAll(addFiles);
			}
		}

		// 3. Deduplicate: Remove files from Global list that are already covered by Project scope
		if(hasProjectScope()) {
			String projectPathPrefix = PolarionUtils.getTrackerProject(projectId).getLocation().getLocationPath();
			// Ensure prefix format matches location paths
			if(!projectPathPrefix.startsWith("/")) {
				projectPathPrefix = "/" + projectPathPrefix;
			}

			String prefix = projectPathPrefix;
			globalFiles.removeIf(f -> {
				String path = f.getLocation().getLocationPath();
				if(!path.startsWith("/")) path = "/" + path;
				return path.startsWith(prefix + "/");
			});
		}

		files.addAll(globalFiles);

		return files.stream()
				.sorted((p1, p2) -> p1.getFileName().compareTo(p2.getFileName()))
				.collect(Collectors.toList());
	}

	private List<RepoFile> loadFilesFromLocation(ILocation searchLoc, String extension, String projectIdForScope, ILocation relativeRoot) {
		List<RepoFile> foundFiles = new ArrayList<>();
		if(repoConnection.exists(searchLoc)) {
			try {
				for(Object location : repoConnection.getSubLocations(searchLoc, true)) {
					if(Objects.equals(extension, ((ILocation) location).getLastComponentExtension())) {
						// Pass the relativeRoot so getRelativePath calculates path relative to the project/global root, not the search folder.
						String relativePath = getRelativePath((ILocation) location, relativeRoot);
						foundFiles.add(loadRepoFileForLocation(projectIdForScope, (ILocation) location, relativePath, false));
					}
				}
			}
			catch(Exception e) {
				e.printStackTrace();
			}
		}
		return foundFiles;
	}

	private boolean hasProjectScope() {
		return !Objects.isNull(projectId);
	}

	private RepoFile loadRepoFileForLocation(String projectId, ILocation fileLocation, String fileName, boolean loadContent)
			throws IOException {
		String content = null;
		if(loadContent) {
			StringWriter writer = new StringWriter();
			try(InputStream fileContent = repoConnection.getContent(fileLocation)) {
				IOUtils.copy(fileContent, writer, StandardCharsets.UTF_8);
			}
			content = writer.toString();
		}
		return new RepoFile(projectId, fileLocation, repoConnection.getRevisionMetaData(fileLocation, false),
				content, fileName);
	}

	private ILocation resolveTargetLocation(String projectId, String fileName) throws RepositoryConfigurationException {
		// Clean up input
		String cleanName = fileName;
		if(cleanName.startsWith("/")) {
			cleanName = cleanName.substring(1);
		}

		// Enforce .copilot folder
		// If the name is exactly ".copilot", we don't append (weird edge case, but assuming filenames)
		// If it doesn't start with .copilot/, prepend it.
		if(!cleanName.startsWith(SEARCH_PATH + "/")) {
			cleanName = SEARCH_PATH + "/" + cleanName;
		}

		ILocation base;
		if(Objects.nonNull(projectId)) {
			base = PolarionUtils.getTrackerProject(projectId).getLocation();
		}
		else {
			// Must provide repository name for absolute location (usually "default")
			base = Location.getLocationWithRepository(IRepositoryService.DEFAULT, "/");
		}

		return base.append(cleanName);
	}

	private String getRelativePath(ILocation location, ILocation rootLocation) {
		String fullPath = location.getLocationPath();
		String rootPath = rootLocation.getLocationPath();

		if(fullPath.startsWith(rootPath)) {
			String rel = fullPath.substring(rootPath.length());
			if(rel.startsWith("/")) rel = rel.substring(1);
			return rel;
		}
		return location.getLastComponent();
	}

	@SuppressWarnings("unchecked")
	private List<String> getAdditionalFolders() {
		try {
			ILocation settingsLoc = resolveTargetLocation(this.projectId, "copilot-settings.json");
			if(repoConnection.exists(settingsLoc)) {
				String content = loadFileContent(settingsLoc);
				log.info("Loaded settings from " + settingsLoc.getLocationPath() + ": " + content);
				Gson gson = new Gson();
				Map<String, Object> map = gson.fromJson(content, Map.class);
				if(map != null && map.containsKey("additionalFolders")) {
					Object obj = map.get("additionalFolders");
					if(obj instanceof List) {
						List<String> folders = (List<String>) obj;
						log.info("Found additional folders: " + folders);
						return folders;
					}
				}
			}
			else {
				log.info("Settings file not found at " + settingsLoc.getLocationPath());
			}
		}
		catch(Exception e) {
			log.error("Error loading additional folders", e);
		}
		return Collections.emptyList();
	}

}
