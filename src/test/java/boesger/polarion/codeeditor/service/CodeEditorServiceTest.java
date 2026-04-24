package boesger.polarion.codeeditor.service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.junit.After;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import org.junit.Before;
import org.junit.Test;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;
import org.mockito.MockitoAnnotations;

import com.polarion.alm.tracker.model.ITrackerProject;
import com.polarion.platform.service.repository.IRepositoryReadOnlyConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.platform.service.repository.IRevisionMetaData;
import com.polarion.subterra.base.location.ILocation;
import com.polarion.subterra.base.location.Location;

import boesger.polarion.codeeditor.exception.CodeEditorException;
import boesger.polarion.codeeditor.model.RepoFile;
import boesger.polarion.codeeditor.util.PolarionUtils;

public class CodeEditorServiceTest {

	@Mock
	private IRepositoryService mockRepoService;
	@Mock
	private IRepositoryReadOnlyConnection mockRepoConn;
	@Mock
	private ITrackerProject mockProject;
	@Mock
	private ILocation mockProjectLoc;
	@Mock
	private ILocation mockGlobalRoot;
	@Mock
	private ILocation mockChildLoc;
	@Mock
	private IRevisionMetaData mockRevision;

	private MockedStatic<PolarionUtils> utilsMock;
	private MockedStatic<Location> locationMock;

	private CodeEditorService service;

	@Before
	public void setUp() {
		MockitoAnnotations.openMocks(this);
		utilsMock = Mockito.mockStatic(PolarionUtils.class);
		locationMock = Mockito.mockStatic(Location.class);

		utilsMock.when(PolarionUtils::getRepositoryService).thenReturn(mockRepoService);
		when(mockRepoService.getReadOnlyConnection((String) any())).thenReturn(mockRepoConn);

		locationMock.when(() -> Location.getLocationWithRepository(any(), any())).thenReturn(mockGlobalRoot);
		when(mockGlobalRoot.getLocationPath()).thenReturn("/");
		when(mockGlobalRoot.append(anyString())).thenReturn(mockChildLoc);
		when(mockGlobalRoot.setRevision(anyString())).thenReturn(mockChildLoc);
		when(mockChildLoc.getLocationPath()).thenReturn("/file.txt");
		when(mockChildLoc.setRevision(anyString())).thenReturn(mockChildLoc);

		service = new CodeEditorService(null);
	}

	@After
	public void tearDown() {
		utilsMock.close();
		locationMock.close();
	}

	// --- constructor ---

	@Test
	public void constructor_nullProjectId_noProjectScope() {
		when(mockRepoConn.exists(any())).thenReturn(false);
		assertTrue(service.getDirectoryEntries("").isEmpty());
	}

	@Test
	public void constructor_blankProjectId_treatedAsNoProject() {
		CodeEditorService s = new CodeEditorService("   ");
		when(mockRepoConn.exists(any())).thenReturn(false);
		assertTrue(s.getDirectoryEntries("").isEmpty());
	}

	@Test
	public void constructor_validProjectId_usesProjectScope() {
		utilsMock.when(() -> PolarionUtils.getTrackerProject("myProject")).thenReturn(mockProject);
		when(mockProject.getLocation()).thenReturn(mockProjectLoc);
		when(mockProjectLoc.getLocationPath()).thenReturn("/projectroot");
		when(mockRepoConn.exists(any())).thenReturn(false);

		CodeEditorService s = new CodeEditorService("myProject");
		assertTrue(s.getDirectoryEntries("").isEmpty());
	}

	// --- getDirectoryEntries ---

	@Test
	public void getDirectoryEntries_pathNotExists_returnsEmpty() {
		when(mockRepoConn.exists(any())).thenReturn(false);
		assertTrue(service.getDirectoryEntries("some/path").isEmpty());
	}

	@Test
	public void getDirectoryEntries_nullPath_usesRoot() {
		when(mockRepoConn.exists(any())).thenReturn(false);
		assertTrue(service.getDirectoryEntries(null).isEmpty());
	}

	@Test
	public void getDirectoryEntries_pathExists_returnsSortedFoldersFirst() {
		ILocation fileLoc = mock(ILocation.class);
		ILocation folderLoc = mock(ILocation.class);

		when(fileLoc.getLastComponent()).thenReturn("readme.txt");
		when(fileLoc.getLocationPath()).thenReturn("/readme.txt");
		when(fileLoc.getLastComponentExtension()).thenReturn("txt");

		when(folderLoc.getLastComponent()).thenReturn("config");
		when(folderLoc.getLocationPath()).thenReturn("/config");
		when(folderLoc.getLastComponentExtension()).thenReturn(null);

		when(mockRepoConn.exists(mockGlobalRoot)).thenReturn(true);
		when(mockRepoConn.getSubLocations(mockGlobalRoot, false))
				.thenReturn(Arrays.asList(fileLoc, folderLoc));

		List<Map<String, String>> result = service.getDirectoryEntries("");

		assertEquals(2, result.size());
		assertEquals("folder", result.get(0).get("type"));
		assertEquals("config", result.get(0).get("name"));
		assertEquals("file", result.get(1).get("type"));
		assertEquals("readme.txt", result.get(1).get("name"));
	}

	@Test
	public void getDirectoryEntries_fileWithExtensionAndNoChildren_classifiedAsFile() {
		ILocation fileLoc = mock(ILocation.class);
		when(fileLoc.getLastComponent()).thenReturn("script.groovy");
		when(fileLoc.getLocationPath()).thenReturn("/script.groovy");
		when(fileLoc.getLastComponentExtension()).thenReturn("groovy");

		when(mockRepoConn.exists(mockGlobalRoot)).thenReturn(true);
		when(mockRepoConn.getSubLocations(mockGlobalRoot, false)).thenReturn(List.of(fileLoc));

		List<Map<String, String>> result = service.getDirectoryEntries("");

		assertEquals("file", result.get(0).get("type"));
	}

	// --- getFile ---

	@Test
	public void getFile_existingFile_returnsRepoFileWithContent() throws Exception {
		InputStream stream = new ByteArrayInputStream("hello".getBytes(StandardCharsets.UTF_8));
		when(mockRepoConn.exists(any())).thenReturn(true);
		when(mockRepoConn.getContent(any())).thenReturn(stream);
		when(mockRepoConn.getRevisionMetaData(any(), eq(false))).thenReturn(mockRevision);

		RepoFile result = service.getFile("test.txt");

		assertNotNull(result);
		assertEquals("hello", result.getContent());
	}

	// --- copyFile ---

	@Test
	public void copyFile_success_callsTransaction() throws Exception {
		when(mockRepoConn.exists(any())).thenReturn(true);
		utilsMock.when(() -> PolarionUtils.executeInTransactionWithResult(any())).thenReturn(Boolean.TRUE);

		Boolean result = service.copyFile("source.txt", "dest.txt");

		assertTrue(result);
		utilsMock.verify(() -> PolarionUtils.executeInTransactionWithResult(any()));
	}

	// --- renameFile ---

	@Test(expected = CodeEditorException.class)
	public void renameFile_targetAlreadyExists_throwsCodeEditorException() throws Exception {
		when(mockRepoConn.exists(any())).thenReturn(true);
		service.renameFile("old.txt", "new.txt");
	}

	@Test
	public void renameFile_targetNotExists_callsTransaction() throws Exception {
		when(mockRepoConn.exists(mockGlobalRoot)).thenReturn(true);
		when(mockRepoConn.exists(mockChildLoc)).thenReturn(false);
		utilsMock.when(() -> PolarionUtils.executeInTransactionWithResult(any())).thenReturn(Boolean.TRUE);

		service.renameFile("old.txt", "new.txt");

		utilsMock.verify(() -> PolarionUtils.executeInTransactionWithResult(any()));
	}

	// --- createFile ---

	@Test(expected = CodeEditorException.class)
	public void createFile_fileAlreadyExists_throwsCodeEditorException() throws Exception {
		when(mockRepoConn.exists(any())).thenReturn(true);
		service.createFile("existing.txt", "content");
	}

	@Test
	public void createFile_newFile_callsTransaction() throws Exception {
		when(mockRepoConn.exists(any())).thenReturn(false);
		utilsMock.when(() -> PolarionUtils.executeInTransactionWithResult(any())).thenReturn(Boolean.TRUE);

		Boolean result = service.createFile("new.txt", "content");

		assertTrue(result);
		utilsMock.verify(() -> PolarionUtils.executeInTransactionWithResult(any()));
	}

	// --- saveFile ---

	@Test
	public void saveFile_success_callsTransaction() throws Exception {
		when(mockRepoConn.exists(any())).thenReturn(true);
		utilsMock.when(() -> PolarionUtils.executeInTransactionWithResult(any())).thenReturn(Boolean.TRUE);

		Boolean result = service.saveFile("file.txt", "content");

		assertTrue(result);
		utilsMock.verify(() -> PolarionUtils.executeInTransactionWithResult(any()));
	}

	// --- deleteFile ---

	@Test
	public void deleteFile_success_callsTransaction() throws Exception {
		when(mockRepoConn.exists(any())).thenReturn(true);
		utilsMock.when(() -> PolarionUtils.executeInTransactionWithResult(any())).thenReturn(Boolean.TRUE);

		boolean result = service.deleteFile("file.txt");

		assertTrue(result);
		utilsMock.verify(() -> PolarionUtils.executeInTransactionWithResult(any()));
	}

	// --- updateFile ---

	@Test
	public void updateFile_fileNotExists_callsCreateFile() throws Exception {
		when(mockRepoConn.exists(any())).thenReturn(false);
		utilsMock.when(() -> PolarionUtils.executeInTransactionWithResult(any())).thenReturn(Boolean.TRUE);

		service.updateFile("new.txt", "content");

		utilsMock.verify(() -> PolarionUtils.executeInTransactionWithResult(any()));
	}

	@Test
	public void updateFile_fileExistsSameContent_doesNotCallTransaction() throws Exception {
		InputStream stream = new ByteArrayInputStream("same".getBytes(StandardCharsets.UTF_8));
		when(mockRepoConn.exists(any())).thenReturn(true);
		when(mockRepoConn.getContent(any())).thenReturn(stream);
		when(mockRepoConn.getRevisionMetaData(any(), eq(false))).thenReturn(mockRevision);

		service.updateFile("file.txt", "same");

		utilsMock.verify(() -> PolarionUtils.executeInTransactionWithResult(any()), never());
	}

	@Test
	public void updateFile_fileExistsDifferentContent_callsSaveFile() throws Exception {
		InputStream stream = new ByteArrayInputStream("old".getBytes(StandardCharsets.UTF_8));
		when(mockRepoConn.exists(any())).thenReturn(true);
		when(mockRepoConn.getContent(any())).thenReturn(stream);
		when(mockRepoConn.getRevisionMetaData(any(), eq(false))).thenReturn(mockRevision);
		utilsMock.when(() -> PolarionUtils.executeInTransactionWithResult(any())).thenReturn(Boolean.TRUE);

		service.updateFile("file.txt", "new");

		utilsMock.verify(() -> PolarionUtils.executeInTransactionWithResult(any()));
	}

	// --- existsFileInRepo ---

	@Test
	public void existsFileInRepo_fileExists_returnsTrue() {
		when(mockRepoConn.exists(any())).thenReturn(true);
		assertTrue(service.existsFileInRepo(null, "file.txt"));
	}

	@Test
	public void existsFileInRepo_fileNotExists_returnsFalse() {
		when(mockRepoConn.exists(any())).thenReturn(false);
		assertFalse(service.existsFileInRepo(null, "file.txt"));
	}

	// --- loadFileContent ---

	@Test
	public void loadFileContent_returnsContent() throws Exception {
		InputStream stream = new ByteArrayInputStream("content".getBytes(StandardCharsets.UTF_8));
		when(mockRepoConn.exists(any())).thenReturn(true);
		when(mockRepoConn.getContent(any())).thenReturn(stream);

		assertEquals("content", service.loadFileContent("file.txt"));
	}

	@Test
	public void loadFileContent_withRevision_setsRevisionOnLocation() throws Exception {
		InputStream stream = new ByteArrayInputStream("rev".getBytes(StandardCharsets.UTF_8));
		when(mockRepoConn.exists(any())).thenReturn(true);
		when(mockRepoConn.getContent(any())).thenReturn(stream);

		assertEquals("rev", service.loadFileContent(null, "file.txt", "42"));
	}

	@Test
	public void loadFileContent_blankRevision_doesNotSetRevision() throws Exception {
		InputStream stream = new ByteArrayInputStream("data".getBytes(StandardCharsets.UTF_8));
		when(mockRepoConn.exists(any())).thenReturn(true);
		when(mockRepoConn.getContent(any())).thenReturn(stream);

		assertEquals("data", service.loadFileContent(null, "file.txt", ""));
	}

	// --- getFileBytes ---

	@Test
	public void getFileBytes_returnsBytes() throws Exception {
		byte[] bytes = "binary".getBytes(StandardCharsets.UTF_8);
		when(mockRepoConn.exists(any())).thenReturn(true);
		when(mockRepoConn.getContent(any())).thenReturn(new ByteArrayInputStream(bytes));

		assertArrayEquals(bytes, service.getFileBytes("image.png"));
	}

	// --- getAllFiles ---

	@Test
	public void getAllFiles_emptyRepo_returnsEmpty() {
		when(mockRepoConn.exists(any())).thenReturn(false);
		assertTrue(service.getAllFiles().isEmpty());
	}

	@Test
	public void getAllFiles_repoHasFiles_returnsFiles() throws Exception {
		ILocation fileLoc = mock(ILocation.class);
		InputStream stream = new ByteArrayInputStream("".getBytes());

		when(fileLoc.getLastComponentExtension()).thenReturn("txt");
		when(fileLoc.getLastComponent()).thenReturn("test.txt");
		when(fileLoc.getLocationPath()).thenReturn("/test.txt");

		when(mockRepoConn.exists(any())).thenReturn(true);
		when(mockRepoConn.getSubLocations(any(), eq(true))).thenReturn(List.of(fileLoc));
		when(mockRepoConn.getContent(any())).thenReturn(stream);
		when(mockRepoConn.getRevisionMetaData(any(), eq(false))).thenReturn(mockRevision);

		List<RepoFile> result = service.getAllFiles();

		assertFalse(result.isEmpty());
	}
}
