package boesger.polarion.codeeditor.service.action;

import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
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

public class SaveFileActionTest {

	@Mock
	private ILocation fileLocation;

	@Mock
	private ILocation parentLocation;

	@Mock
	private IRepositoryConnection mockWriteConn;

	@Before
	public void setUp() {
		MockitoAnnotations.openMocks(this);
	}

	@Test
	public void constructor_storesLocationAndContent() {
		SaveFileAction action = new SaveFileAction(fileLocation, "content");
		assertTrue(action instanceof PolarionUtils.RunnableWEx);
	}

	@Test
	public void run_fileAlreadyExists_setsContent() throws Exception {
		when(mockWriteConn.exists(fileLocation)).thenReturn(true);

		Method getPlatformMethod = PlatformContext.class.getMethod("getPlatform");
		Object mockPlatform = Mockito.mock(getPlatformMethod.getReturnType());

		try(MockedStatic<PlatformContext> pcMock = Mockito.mockStatic(PlatformContext.class)) {
			pcMock.when(PlatformContext::getPlatform).thenAnswer(inv -> mockPlatform);

			try(MockedStatic<PolarionUtils> utilsMock = Mockito.mockStatic(PolarionUtils.class)) {
				utilsMock.when(PolarionUtils::getRepositoryWriteConnection).thenReturn(mockWriteConn);
				utilsMock.when(() -> PolarionUtils.toInputStream("hello")).thenCallRealMethod();

				SaveFileAction action = new SaveFileAction(fileLocation, "hello");
				Boolean result = action.run();

				assertTrue(result);
				verify(mockWriteConn).setContent(eq(fileLocation), any());
			}
		}
	}

	@Test
	public void run_fileNotExists_parentMissing_makesFoldersAndCreates() throws Exception {
		when(mockWriteConn.exists(fileLocation)).thenReturn(false);
		when(fileLocation.getParentLocation()).thenReturn(parentLocation);
		when(mockWriteConn.exists(parentLocation)).thenReturn(false);

		Method getPlatformMethod = PlatformContext.class.getMethod("getPlatform");
		Object mockPlatform = Mockito.mock(getPlatformMethod.getReturnType());

		try(MockedStatic<PlatformContext> pcMock = Mockito.mockStatic(PlatformContext.class)) {
			pcMock.when(PlatformContext::getPlatform).thenAnswer(inv -> mockPlatform);

			try(MockedStatic<PolarionUtils> utilsMock = Mockito.mockStatic(PolarionUtils.class)) {
				utilsMock.when(PolarionUtils::getRepositoryWriteConnection).thenReturn(mockWriteConn);
				utilsMock.when(() -> PolarionUtils.toInputStream("data")).thenCallRealMethod();

				SaveFileAction action = new SaveFileAction(fileLocation, "data");
				Boolean result = action.run();

				assertTrue(result);
				verify(mockWriteConn).makeFolders(parentLocation);
				verify(mockWriteConn).create(eq(fileLocation), any());
			}
		}
	}

	@Test
	public void run_fileNotExists_parentExists_createsWithoutMakingFolders() throws Exception {
		when(mockWriteConn.exists(fileLocation)).thenReturn(false);
		when(fileLocation.getParentLocation()).thenReturn(parentLocation);
		when(mockWriteConn.exists(parentLocation)).thenReturn(true);

		Method getPlatformMethod = PlatformContext.class.getMethod("getPlatform");
		Object mockPlatform = Mockito.mock(getPlatformMethod.getReturnType());

		try(MockedStatic<PlatformContext> pcMock = Mockito.mockStatic(PlatformContext.class)) {
			pcMock.when(PlatformContext::getPlatform).thenAnswer(inv -> mockPlatform);

			try(MockedStatic<PolarionUtils> utilsMock = Mockito.mockStatic(PolarionUtils.class)) {
				utilsMock.when(PolarionUtils::getRepositoryWriteConnection).thenReturn(mockWriteConn);
				utilsMock.when(() -> PolarionUtils.toInputStream("data")).thenCallRealMethod();

				SaveFileAction action = new SaveFileAction(fileLocation, "data");
				Boolean result = action.run();

				assertTrue(result);
				verify(mockWriteConn).create(eq(fileLocation), any());
			}
		}
	}
}
