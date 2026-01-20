package boesger.polarion.copilot.core.fileeditor;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

import org.apache.commons.io.IOUtils;

import com.polarion.platform.repository.config.RepositoryConfigurationException;
import com.polarion.platform.service.repository.IRepositoryReadOnlyConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.subterra.base.location.ILocation;
import com.polarion.subterra.base.location.Location;

import boesger.polarion.copilot.core.fileeditor.actions.CopyFileAction;
import boesger.polarion.copilot.core.fileeditor.actions.DeleteFileAction;
import boesger.polarion.copilot.core.fileeditor.actions.RenameFileAction;
import boesger.polarion.copilot.core.fileeditor.actions.SaveFileAction;
import boesger.polarion.copilot.utils.PolarionUtils;

public class FileEditorService {

	private String projectId = null;
	private IRepositoryReadOnlyConnection repoConnection;

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
		return loadRepoFileForLocation(projectId, getFileRepoLocation(projectId, fileName), fileName);
	}

	public Boolean copyFile(String currentFileName, String newFileName) throws Exception {
		ILocation currentFileLocation = getFileRepoLocation(this.projectId, currentFileName);
		ILocation newFileLocation;
		if(Objects.nonNull(projectId)) {
			newFileLocation = PolarionUtils.getTrackerProject(projectId).getLocation().append(newFileName);
		}
		else {
			newFileLocation = Location.getLocation(newFileName.startsWith("/") ? newFileName : "/" + newFileName);
		}
		return PolarionUtils.executeInTransactionWithResult(new CopyFileAction(currentFileLocation, newFileLocation));
	}

	public void renameFile(String currentFileName, String newFileName) throws Exception {
		ILocation currentFileLocation = getFileRepoLocation(this.projectId, currentFileName);
		ILocation newFileLocation;
		if(Objects.nonNull(projectId))
			newFileLocation = PolarionUtils.getTrackerProject(projectId).getLocation().append(newFileName);
		else
			newFileLocation = Location.getLocation(newFileName.startsWith("/") ? newFileName : "/" + newFileName);

		if(repoConnection.exists(newFileLocation)) { throw new CopilotFileException(String.format("A file with the new name '%s' exists already!", newFileName)); }

		PolarionUtils.executeInTransaction(new RenameFileAction(currentFileLocation, newFileLocation));
	}

	public Boolean createFile(String fileName, String content) throws Exception {
		ILocation newFileLocation;

		if(Objects.nonNull(projectId))
			newFileLocation = PolarionUtils.getTrackerProject(projectId).getLocation().append(fileName);
		else
			newFileLocation = Location.getLocation(fileName.startsWith("/") ? fileName : "/" + fileName);

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
			files.addAll(loadFilesFromLocation(projLoc, extension, projectId));
		}

		// 2. Load global files (full path from root)
		List<RepoFile> globalFiles = loadFilesFromLocation(Location.getLocation("/"), extension, null);

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

	private List<RepoFile> loadFilesFromLocation(ILocation folderLoc, String extension, String projectIdForScope) {
		List<RepoFile> foundFiles = new ArrayList<>();
		if(repoConnection.exists(folderLoc)) {
			try {
				for(Object location : repoConnection.getSubLocations(folderLoc, true)) {
					if(Objects.equals(extension, ((ILocation) location).getLastComponentExtension())) {
						// Pass the folderLoc as 'root' so getRelativePath calculates path relative to it.
						String relativePath = getRelativePath((ILocation) location, folderLoc);
						foundFiles.add(loadRepoFileForLocation(projectIdForScope, (ILocation) location, relativePath));
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

	private RepoFile loadRepoFileForLocation(String projectId, ILocation fileLocation, String fileName)
			throws IOException {
		StringWriter writer = new StringWriter();
		try(InputStream fileContent = repoConnection.getContent(fileLocation)) {
			IOUtils.copy(fileContent, writer, StandardCharsets.UTF_8);
		}
		return new RepoFile(projectId, fileLocation, repoConnection.getRevisionMetaData(fileLocation, false),
				writer.toString(), fileName);
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

}
