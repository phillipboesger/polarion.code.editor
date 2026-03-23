package boesger.polarion.fileeditor.service;

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

import boesger.polarion.fileeditor.exception.FileEditorException;
import boesger.polarion.fileeditor.logger.PluginLogger;
import boesger.polarion.fileeditor.model.RepoFile;
import boesger.polarion.fileeditor.service.action.CopyFileAction;
import boesger.polarion.fileeditor.service.action.DeleteFileAction;
import boesger.polarion.fileeditor.service.action.RenameFileAction;
import boesger.polarion.fileeditor.service.action.SaveFileAction;
import boesger.polarion.fileeditor.util.PolarionUtils;

public class FileEditorService {

	private static final PluginLogger log = new PluginLogger(FileEditorService.class);
	private static final String SEARCH_PATH = ".file-editor";
	private static final String PATH_SEP = "/";

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

	public Boolean copyFile(String currentFileName, String newFileName) throws FileEditorException {
		ILocation currentFileLocation = getFileRepoLocation(this.projectId, currentFileName);
		ILocation newFileLocation = resolveTargetLocation(this.projectId, newFileName);

		return PolarionUtils.executeInTransactionWithResult(new CopyFileAction(currentFileLocation, newFileLocation));
	}

	public void renameFile(String currentFileName, String newFileName) throws FileEditorException {
		ILocation currentFileLocation = getFileRepoLocation(this.projectId, currentFileName);
		ILocation newFileLocation = resolveTargetLocation(this.projectId, newFileName);

		if(repoConnection.exists(newFileLocation)) { throw new FileEditorException(String.format("A file with the new name '%s' exists already!", newFileName)); }

		PolarionUtils.executeInTransaction(new RenameFileAction(currentFileLocation, newFileLocation));
	}

	public Boolean createFile(String fileName, String content) throws FileEditorException {
		ILocation newFileLocation = resolveTargetLocation(this.projectId, fileName);

		if(repoConnection.exists(newFileLocation)) { throw new FileEditorException(String.format("A file with the name '%s' exists already!", fileName)); }

		return PolarionUtils.executeInTransactionWithResult(new SaveFileAction(newFileLocation, content));
	}

	public Boolean saveFile(String fileName, String content) throws FileEditorException {
		ILocation fileLocation = getFileRepoLocation(this.projectId, fileName);
		return PolarionUtils.executeInTransactionWithResult(new SaveFileAction(fileLocation, content));
	}

	public boolean deleteFile(String fileName) throws FileEditorException {
		ILocation fileLocation = getFileRepoLocation(this.projectId, fileName);
		return PolarionUtils.executeInTransactionWithResult(new DeleteFileAction(fileLocation));
	}

	public void updateFile(String fileName, String content) throws IOException, FileEditorException {
		try {
			createFile(fileName, content);
		}
		catch(FileEditorException e) {
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

		ILocation globalLocation = Location.getLocation(fileName.startsWith("/") ? fileName : "/" + fileName);

		ILocation projectLocation = null;
		if(Objects.nonNull(projectId)) {
			projectLocation = PolarionUtils.getTrackerProject(projectId).getLocation().append(fileName);
		}

		if(Objects.nonNull(projectLocation) && repoConnection.exists(projectLocation)) {
			return projectLocation;
		}
		else if(repoConnection.exists(globalLocation)) {
			return globalLocation;
		}
		else {
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
		if(fileLocation != null && Objects.nonNull(revision) && !revision.isBlank()) {
			fileLocation = fileLocation.setRevision(revision);
		}
		return loadFileContent(fileLocation);
	}

	public boolean existsFileInRepo(String projectId, String fileName) {
		try {
			ILocation loc = getFileRepoLocation(projectId, fileName);
			return repoConnection.exists(loc);
		}
		catch(RepositoryConfigurationException | IllegalArgumentException e) {
			log.debug("File existence check failed for '" + fileName + "': " + e.getMessage());
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

		if(hasProjectScope()) {
			ILocation projLoc = PolarionUtils.getTrackerProject(projectId).getLocation();
			files.addAll(loadFilesFromLocation(projLoc.append(SEARCH_PATH), extension, projectId, projLoc));
		}

		ILocation globalRoot = Location.getLocationWithRepository(IRepositoryService.DEFAULT, PATH_SEP);
		List<RepoFile> globalFiles = loadFilesFromLocation(globalRoot.append(SEARCH_PATH), extension, null, globalRoot);

		loadAdditionalFolderFiles(getAdditionalFolders(), globalRoot, extension, files, globalFiles);

		if(hasProjectScope()) {
			removeDuplicateGlobalFiles(globalFiles);
		}

		files.addAll(globalFiles);
		return files.stream()
				.sorted((p1, p2) -> p1.getFileName().compareTo(p2.getFileName()))
				.collect(Collectors.toList());
	}

	private void loadAdditionalFolderFiles(List<String> additionalFolders, ILocation globalRoot,
			String extension, List<RepoFile> projectFiles, List<RepoFile> globalFiles) {
		for(String folder : additionalFolders) {
			if(folder == null || folder.trim().isEmpty()) continue;

			ILocation root = hasProjectScope() ? PolarionUtils.getTrackerProject(projectId).getLocation() : globalRoot;
			List<RepoFile> addFiles = loadFilesFromLocation(root.append(folder), extension,
					hasProjectScope() ? projectId : null, root);

			if(hasProjectScope()) {
				projectFiles.addAll(addFiles);
			}
			else {
				globalFiles.addAll(addFiles);
			}
		}
	}

	private void removeDuplicateGlobalFiles(List<RepoFile> globalFiles) {
		String projectPathPrefix = PolarionUtils.getTrackerProject(projectId).getLocation().getLocationPath();
		if(!projectPathPrefix.startsWith(PATH_SEP)) {
			projectPathPrefix = PATH_SEP + projectPathPrefix;
		}
		String prefix = projectPathPrefix;
		globalFiles.removeIf(f -> {
			String path = f.getLocation().getLocationPath();
			if(!path.startsWith(PATH_SEP)) path = PATH_SEP + path;
			return path.startsWith(prefix + PATH_SEP);
		});
	}

	private List<RepoFile> loadFilesFromLocation(ILocation searchLoc, String extension, String projectIdForScope, ILocation relativeRoot) {
		List<RepoFile> foundFiles = new ArrayList<>();
		if(repoConnection.exists(searchLoc)) {
			try {
				for(Object location : repoConnection.getSubLocations(searchLoc, true)) {
					if(Objects.equals(extension, ((ILocation) location).getLastComponentExtension())) {
						String relativePath = getRelativePath((ILocation) location, relativeRoot);
						foundFiles.add(loadRepoFileForLocation(projectIdForScope, (ILocation) location, relativePath, false));
					}
				}
			}
			catch(IOException e) {
				log.error("Error loading files from location: " + searchLoc, e);
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
		String cleanName = fileName;
		if(cleanName.startsWith("/")) {
			cleanName = cleanName.substring(1);
		}

		if(!cleanName.startsWith(SEARCH_PATH + "/")) {
			cleanName = SEARCH_PATH + "/" + cleanName;
		}

		ILocation base;
		if(Objects.nonNull(projectId)) {
			base = PolarionUtils.getTrackerProject(projectId).getLocation();
		}
		else {
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
			ILocation settingsLoc = resolveTargetLocation(this.projectId, "file-editor-settings.json");
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
		catch(IOException | RepositoryConfigurationException e) {
			log.error("Error loading additional folders", e);
		}
		return Collections.emptyList();
	}

}
