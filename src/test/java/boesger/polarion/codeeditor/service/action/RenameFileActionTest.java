package boesger.polarion.codeeditor.service.action;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertTrue;
import org.junit.Before;
import org.junit.Test;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;
import org.mockito.MockitoAnnotations;

import com.polarion.platform.core.PlatformContext;
import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.platform.service.repository.IRepositoryReadOnlyConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.codeeditor.util.PolarionUtils;

public class RenameFileActionTest {

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
		RenameFileAction action = new RenameFileAction(srcLocation, dstLocation);
		assertTrue(action instanceof PolarionUtils.RunnableWEx);
	}

	@Test
	public void run_copiesContentAndDeletesSource() throws Exception {
		InputStream content = new ByteArrayInputStream("data".getBytes(StandardCharsets.UTF_8));
		when(mockRepoService.getReadOnlyConnection(IRepositoryService.DEFAULT)).thenReturn(mockReadConn);
		when(mockReadConn.getContent(srcLocation)).thenReturn(content);

		Method getPlatformMethod = PlatformContext.class.getMethod("getPlatform");
		Object mockPlatform = Mockito.mock(getPlatformMethod.getReturnType());

		try(MockedStatic<PlatformContext> pcMock = Mockito.mockStatic(PlatformContext.class)) {
			pcMock.when(PlatformContext::getPlatform).thenAnswer(inv -> mockPlatform);

			try(MockedStatic<PolarionUtils> utilsMock = Mockito.mockStatic(PolarionUtils.class)) {
				utilsMock.when(PolarionUtils::getRepositoryService).thenReturn(mockRepoService);
				utilsMock.when(PolarionUtils::getRepositoryWriteConnection).thenReturn(mockWriteConn);

				RenameFileAction action = new RenameFileAction(srcLocation, dstLocation);
				Boolean result = action.run();

				assertTrue(result);
				InOrder order = inOrder(mockWriteConn);
				order.verify(mockWriteConn).create(dstLocation, content);
				order.verify(mockWriteConn).delete(srcLocation);
			}
		}
	}
}
