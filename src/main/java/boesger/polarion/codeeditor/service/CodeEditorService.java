package boesger.polarion.codeeditor.service;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.apache.commons.io.IOUtils;

import com.polarion.platform.repository.config.RepositoryConfigurationException;
import com.polarion.platform.service.repository.IRepositoryReadOnlyConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.subterra.base.location.ILocation;
import com.polarion.subterra.base.location.Location;

import com.polarion.core.util.logging.Logger;

import boesger.polarion.codeeditor.exception.CodeEditorException;
import boesger.polarion.codeeditor.model.RepoFile;
import boesger.polarion.codeeditor.service.action.CopyFileAction;
import boesger.polarion.codeeditor.service.action.DeleteFileAction;
import boesger.polarion.codeeditor.service.action.RenameFileAction;
import boesger.polarion.codeeditor.service.action.SaveFileAction;
import boesger.polarion.codeeditor.util.PolarionUtils;

public class CodeEditorService {

	private static final Logger log = Logger.getLogger(CodeEditorService.class.getName());
	private static final String PATH_SEP = "/";

	private String projectId = null;
	private final IRepositoryReadOnlyConnection repoConnection;

	public CodeEditorService(String projectId) {
		this.projectId = Objects.nonNull(projectId) && !projectId.isBlank() ? projectId : null;
		this.repoConnection = PolarionUtils.getRepositoryService().getReadOnlyConnection(IRepositoryService.DEFAULT);
	}

	/**
	 * Returns all files regardless of file extension.
	 */
	public List<RepoFile> getAllFiles() {
		return getFiles(null);
	}

	/**
	 * Returns the direct children (files and sub-folders) of the given relative path.
	 * <p>
	 * <b>Folder detection heuristic:</b> an entry is classified as a folder when its
	 * {@code getLastComponentExtension()} returns an empty or {@code null} value.
	 * This covers the vast majority of real-world SVN structures. Files without an
	 * extension (e.g. {@code Dockerfile}, {@code Makefile}, {@code LICENSE}) will be
	 * mis-classified as folders by this heuristic. If the Polarion API version in use
	 * exposes a reliable {@code isDirectory()} / {@code isContainer()} method on
	 * {@code IRepositoryReadOnlyConnection}, prefer that over this approach.
	 * </p>
	 * The result is sorted: folders first, then files, each group alphabetically.
	 * This method is intended for lazy / incremental tree loading.
	 *
	 * @param  path relative path within the root (e.g. "config/")
	 * @return      list of entries, each with keys "name", "path", "type" ("file"|"folder")
	 */
	public List<Map<String, String>> getDirectoryEntries(String path) {
		ILocation rootLoc = hasProjectScope()
				? PolarionUtils.getTrackerProject(projectId).getLocation()
				: Location.getLocationWithRepository(IRepositoryService.DEFAULT, PATH_SEP);

		String cleanPath = normalizePath(path);
		ILocation searchLoc = cleanPath.isEmpty() ? rootLoc : rootLoc.append(cleanPath);

		if(!repoConnection.exists(searchLoc)) { return Collections.emptyList(); }

		List<Map<String, String>> entries = new ArrayList<>();
		for(ILocation childLoc : toLocationList(repoConnection.getSubLocations(searchLoc, false))) {
			String childName = childLoc.getLastComponent();
			String childRelPath = getRelativePath(childLoc, rootLoc);
			boolean isDir = isDirectoryEntry(childLoc);

			entries.add(createDirectoryEntry(childName, childRelPath, isDir));
		}

		// Sort: folders first, then files; each group alphabetically
		entries.sort((a, b) -> {
			boolean aFolder = "folder".equals(a.get("type"));
			boolean bFolder = "folder".equals(b.get("type"));
			if(aFolder != bFolder) return aFolder ? -1 : 1;
			return a.get("name").compareToIgnoreCase(b.get("name"));
		});

		return entries;
	}

	public RepoFile getFile(String fileName)
			throws RepositoryConfigurationException, IllegalArgumentException, IOException {
		return loadRepoFileForLocation(projectId, getFileRepoLocation(projectId, fileName), fileName, true);
	}

	public Boolean copyFile(String currentFileName, String newFileName) throws CodeEditorException {
		ILocation currentFileLocation = getFileRepoLocation(this.projectId, currentFileName);
		ILocation newFileLocation = resolveTargetLocation(this.projectId, newFileName);

		return PolarionUtils.executeInTransactionWithResult(new CopyFileAction(currentFileLocation, newFileLocation));
	}

	public void renameFile(String currentFileName, String newFileName) throws CodeEditorException {
		ILocation currentFileLocation = getFileRepoLocation(this.projectId, currentFileName);
		ILocation newFileLocation = resolveTargetLocation(this.projectId, newFileName);

		if(repoConnection.exists(newFileLocation)) { throw new CodeEditorException(String.format("A file with the new name '%s' exists already!", newFileName)); }

		PolarionUtils.executeInTransactionWithResult(new RenameFileAction(currentFileLocation, newFileLocation));
	}

	public Boolean createFile(String fileName, String content) throws CodeEditorException {
		ILocation newFileLocation = resolveTargetLocation(this.projectId, fileName);

		if(repoConnection.exists(newFileLocation)) { throw new CodeEditorException(String.format("A file with the name '%s' exists already!", fileName)); }

		return PolarionUtils.executeInTransactionWithResult(new SaveFileAction(newFileLocation, content));
	}

	public Boolean saveFile(String fileName, String content) throws CodeEditorException {
		ILocation fileLocation = getFileRepoLocation(this.projectId, fileName);
		return PolarionUtils.executeInTransactionWithResult(new SaveFileAction(fileLocation, content));
	}

	public boolean deleteFile(String fileName) throws CodeEditorException {
		ILocation fileLocation = getFileRepoLocation(this.projectId, fileName);
		return PolarionUtils.executeInTransactionWithResult(new DeleteFileAction(fileLocation));
	}

	public void updateFile(String fileName, String content) throws IOException, CodeEditorException {
		boolean fileExists = existsFileInRepo(this.projectId, fileName);
		if(!fileExists) {
			createFile(fileName, content);
			return;
		}

		if(!Objects.equals(getFile(fileName).getContent(), content)) {
			saveFile(fileName, content);
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
			log.debug("File existence check failed for '" + fileName + "': " + e.getMessage()); // NOSONAR: intentional debug log
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
			files.addAll(loadFilesFromLocation(resolveSearchLocation(projLoc), extension, projectId, projLoc));
		}

		ILocation globalRoot = Location.getLocationWithRepository(IRepositoryService.DEFAULT, PATH_SEP);
		List<RepoFile> globalFiles = loadFilesFromLocation(resolveSearchLocation(globalRoot), extension, null, globalRoot);

		if(hasProjectScope()) {
			removeDuplicateGlobalFiles(globalFiles);
		}

		files.addAll(globalFiles);
		return files.stream()
				.sorted((p1, p2) -> p1.getFileName().compareTo(p2.getFileName()))
				.collect(Collectors.toList());
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
				for(ILocation loc : toLocationList(repoConnection.getSubLocations(searchLoc, true))) {
					// When extension is null, include every file; otherwise filter by extension
					if(extension == null || Objects.equals(extension, loc.getLastComponentExtension())) {
						String relativePath = getRelativePath(loc, relativeRoot);
						foundFiles.add(loadRepoFileForLocation(projectIdForScope, loc, relativePath, false));
					}
				}
			}
			catch(IOException e) {
				log.error("Error loading files from location: " + searchLoc + ": " + e);
			}
		}
		return foundFiles;
	}

	private ILocation resolveSearchLocation(ILocation rootLocation) {
		return rootLocation;
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

	private String normalizePath(String path) {
		if(path == null || path.isBlank()) {
			return "";
		}

		int start = 0;
		int end = path.length();
		while(start < end && path.charAt(start) == '/') {
			start++;
		}
		while(end > start && path.charAt(end - 1) == '/') {
			end--;
		}
		return path.substring(start, end);
	}

	private boolean isDirectoryEntry(ILocation childLoc) {
		String ext = childLoc.getLastComponentExtension();
		if(ext == null || ext.isEmpty()) {
			return true;
		}
		return hasChildren(childLoc);
	}

	private boolean hasChildren(ILocation location) {
		try {
			return !repoConnection.getSubLocations(location, false).isEmpty();
		}
		catch(IllegalArgumentException e) {
			return false;
		}
	}

	private Map<String, String> createDirectoryEntry(String name, String relativePath, boolean isDir) {
		Map<String, String> entry = new HashMap<>();
		entry.put("name", name);
		entry.put("path", isDir ? relativePath + PATH_SEP : relativePath);
		entry.put("type", isDir ? "folder" : "file");
		return entry;
	}

	private List<ILocation> toLocationList(List<?> rawLocations) {
		return rawLocations.stream()
				.map(ILocation.class::cast)
				.collect(Collectors.toList());
	}

}
