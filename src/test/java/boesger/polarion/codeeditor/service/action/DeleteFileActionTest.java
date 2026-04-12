package boesger.polarion.codeeditor.service.action;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;

import org.junit.Before;
import org.junit.Test;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.MockitoAnnotations;

import com.polarion.platform.core.PlatformContext;
import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.codeeditor.util.PolarionUtils;

public class DeleteFileActionTest {

	@Mock
	private ILocation fileLocation;

	@Mock
	private IRepositoryConnection mockWriteConn;

	@Before
	public void setUp() {
		MockitoAnnotations.openMocks(this);
	}

	@Test
	public void constructor_storesLocation() {
		DeleteFileAction action = new DeleteFileAction(fileLocation);
		assertTrue(action instanceof PolarionUtils.RunnableWEx);
	}

	@Test
	public void run_fileExists_deletesAndReturnsTrue() throws Exception {
		when(mockWriteConn.exists(fileLocation)).thenReturn(true);

		Method getPlatformMethod = PlatformContext.class.getMethod("getPlatform");
		Object mockPlatform = Mockito.mock(getPlatformMethod.getReturnType());

		try(MockedStatic<PlatformContext> pcMock = Mockito.mockStatic(PlatformContext.class)) {
			pcMock.when(PlatformContext::getPlatform).thenAnswer(inv -> mockPlatform);

			try(MockedStatic<PolarionUtils> utilsMock = Mockito.mockStatic(PolarionUtils.class)) {
				utilsMock.when(PolarionUtils::getRepositoryWriteConnection).thenReturn(mockWriteConn);

				DeleteFileAction action = new DeleteFileAction(fileLocation);
				Boolean result = action.run();

				assertTrue(result);
				verify(mockWriteConn).delete(fileLocation);
			}
		}
	}

	@Test
	public void run_fileNotExists_returnsFalseWithoutDelete() throws Exception {
		when(mockWriteConn.exists(fileLocation)).thenReturn(false);

		Method getPlatformMethod = PlatformContext.class.getMethod("getPlatform");
		Object mockPlatform = Mockito.mock(getPlatformMethod.getReturnType());

		try(MockedStatic<PlatformContext> pcMock = Mockito.mockStatic(PlatformContext.class)) {
			pcMock.when(PlatformContext::getPlatform).thenAnswer(inv -> mockPlatform);

			try(MockedStatic<PolarionUtils> utilsMock = Mockito.mockStatic(PolarionUtils.class)) {
				utilsMock.when(PolarionUtils::getRepositoryWriteConnection).thenReturn(mockWriteConn);

				DeleteFileAction action = new DeleteFileAction(fileLocation);
				Boolean result = action.run();

				assertFalse(result);
				verify(mockWriteConn, never()).delete(fileLocation);
			}
		}
	}
}
