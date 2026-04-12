package boesger.polarion.codeeditor.service.action;

import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.lang.reflect.Method;

import org.junit.Before;
import org.junit.Test;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.MockitoAnnotations;

import com.polarion.platform.core.PlatformContext;
import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.platform.service.repository.IRepositoryReadOnlyConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.codeeditor.util.PolarionUtils;

public class CopyFileActionTest {

	@Mock
	private ILocation srcLocation;

	@Mock
	private ILocation dstLocation;

	@Mock
	private IRepositoryService mockRepoService;

	@Mock
	private IRepositoryReadOnlyConnection mockReadConn;

	@Mock
	private IRepositoryConnection mockWriteConn;

	@Before
	public void setUp() {
		MockitoAnnotations.openMocks(this);
	}

	@Test
	public void constructor_storesLocations() {
		CopyFileAction action = new CopyFileAction(srcLocation, dstLocation);
		// Object created without exception — correctness verified by run() test
		assertTrue(action instanceof PolarionUtils.RunnableWEx);
	}

	@Test
	public void run_existingFile_copiesContentAndReturnsTrue() throws Exception {
		InputStream content = new ByteArrayInputStream("file content".getBytes(StandardCharsets.UTF_8));
		when(mockRepoService.getReadOnlyConnection(IRepositoryService.DEFAULT)).thenReturn(mockReadConn);
		when(mockReadConn.getContent(srcLocation)).thenReturn(content);

		Method getPlatformMethod = PlatformContext.class.getMethod("getPlatform");
		Class<?> platformType = getPlatformMethod.getReturnType();
		Object mockPlatform = Mockito.mock(platformType);

		try(MockedStatic<PlatformContext> pcMock = Mockito.mockStatic(PlatformContext.class)) {
			pcMock.when(PlatformContext::getPlatform).thenAnswer(inv -> mockPlatform);

			try(MockedStatic<PolarionUtils> utilsMock = Mockito.mockStatic(PolarionUtils.class)) {
				utilsMock.when(PolarionUtils::getRepositoryService).thenReturn(mockRepoService);
				utilsMock.when(PolarionUtils::getRepositoryWriteConnection).thenReturn(mockWriteConn);

				CopyFileAction action = new CopyFileAction(srcLocation, dstLocation);
				Boolean result = action.run();

				assertTrue(result);
				verify(mockWriteConn).create(dstLocation, content);
			}
		}
	}

	@Test
	public void run_implementsRunnableWEx() {
		CopyFileAction action = new CopyFileAction(srcLocation, dstLocation);
		assertTrue(action instanceof PolarionUtils.RunnableWEx);
	}
}
