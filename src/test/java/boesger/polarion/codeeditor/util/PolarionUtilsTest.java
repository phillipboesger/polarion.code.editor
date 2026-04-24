package boesger.polarion.codeeditor.util;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.MockitoAnnotations;

import com.polarion.alm.tracker.ITrackerService;
import com.polarion.alm.tracker.model.ITrackerProject;
import com.polarion.platform.ITransactionService;
import com.polarion.platform.core.IPlatform;
import com.polarion.platform.core.PlatformContext;
import com.polarion.platform.persistence.UnresolvableObjectException;
import com.polarion.platform.service.repository.IRepositoryService;

import boesger.polarion.codeeditor.exception.CodeEditorException;

public class PolarionUtilsTest {

	private static MockedStatic<PlatformContext> platformContextMock;

	@Mock
	private ITrackerService mockTrackerService;
	@Mock
	private IRepositoryService mockRepositoryService;
	@Mock
	private ITrackerProject mockProject;

	// Manual transaction service implementation to avoid Mockito inline-mock limitation
	private static final AtomicBoolean canBeginTx = new AtomicBoolean(true);
	private static final AtomicBoolean beginTxCalled = new AtomicBoolean(false);
	private static final AtomicInteger endTxCallCount = new AtomicInteger(0);
	private static final AtomicBoolean endTxRollbackArg = new AtomicBoolean(false);

	private static final ITransactionService STUB_TX = new ITransactionService() {
		@Override
		public boolean canBeginTx() {
			return canBeginTx.get();
		}

		@Override
		public void beginTx() {
			beginTxCalled.set(true);
		}

		@Override
		public void endTx(boolean rollback) {
			endTxCallCount.incrementAndGet();
			endTxRollbackArg.set(rollback);
		}

		@Override
		public void preventThreadKilling() {
			// no-op
		}
	};

	@BeforeClass
	public static void setUpClass() {
		IPlatform mockPlatform = mock(IPlatform.class);
		platformContextMock = Mockito.mockStatic(PlatformContext.class);
		platformContextMock.when(PlatformContext::getPlatform).thenReturn(mockPlatform);
		when(mockPlatform.lookupService(any())).thenReturn(null);
		PolarionUtils.toInputStream(""); // trigger class init
	}

	@AfterClass
	public static void tearDownClass() {
		if(platformContextMock != null) {
			platformContextMock.close();
		}
	}

	@Before
	public void setUp() {
		MockitoAnnotations.openMocks(this);
		PolarionUtils.setTrackerService(mockTrackerService);
		PolarionUtils.setTransactionService(STUB_TX);
		PolarionUtils.setRepositoryService(mockRepositoryService);
		// Reset state
		canBeginTx.set(true);
		beginTxCalled.set(false);
		endTxCallCount.set(0);
		endTxRollbackArg.set(false);
	}

	// --- toInputStream ---

	@Test
	public void toInputStream_validContent_returnsUtf8Bytes() throws IOException {
		InputStream stream = PolarionUtils.toInputStream("hello");
		assertArrayEquals("hello".getBytes(StandardCharsets.UTF_8), stream.readAllBytes());
	}

	@Test
	public void toInputStream_emptyString_returnsEmptyStream() throws IOException {
		InputStream stream = PolarionUtils.toInputStream("");
		assertEquals(0, stream.readAllBytes().length);
	}

	@Test
	public void toInputStream_unicodeContent_preservesEncoding() throws IOException {
		String text = "Ä Ö Ü €";
		InputStream stream = PolarionUtils.toInputStream(text);
		assertArrayEquals(text.getBytes(StandardCharsets.UTF_8), stream.readAllBytes());
	}

	// --- getTrackerProject ---

	@Test
	public void getTrackerProject_nullProjectId_returnsNull() {
		assertNull(PolarionUtils.getTrackerProject(null));
	}

	@Test
	public void getTrackerProject_emptyProjectId_returnsNull() {
		assertNull(PolarionUtils.getTrackerProject(""));
	}

	@Test
	public void getTrackerProject_validProjectId_returnsProject() {
		when(mockTrackerService.getTrackerProject("proj1")).thenReturn(mockProject);
		when(mockProject.isUnresolvable()).thenReturn(false);

		ITrackerProject result = PolarionUtils.getTrackerProject("proj1");

		assertSame(mockProject, result);
	}

	@Test(expected = UnresolvableObjectException.class)
	public void getTrackerProject_unresolvableProject_throwsUnresolvableObjectException() {
		when(mockTrackerService.getTrackerProject("bad")).thenReturn(mockProject);
		when(mockProject.isUnresolvable()).thenReturn(true);

		PolarionUtils.getTrackerProject("bad");
	}

	// --- executeInTransactionWithResult ---

	@Test
	public void executeInTransactionWithResult_success_returnsValue() throws Exception {
		String result = PolarionUtils.executeInTransactionWithResult(() -> "hello");

		assertEquals("hello", result);
		assertTrue(beginTxCalled.get());
		assertEquals(1, endTxCallCount.get());
		assertFalse(endTxRollbackArg.get());
	}

	@Test
	public void executeInTransactionWithResult_cannotBeginTx_endsExistingTransactionFirst() throws Exception {
		canBeginTx.set(false);

		PolarionUtils.executeInTransactionWithResult(() -> "ok");

		// endTx(true) for rollback of previous tx, then endTx(false) on success
		assertEquals(2, endTxCallCount.get());
	}

	@Test(expected = CodeEditorException.class)
	public void executeInTransactionWithResult_functionThrows_throwsCodeEditorException() throws Exception {
		PolarionUtils.executeInTransactionWithResult(() -> {
			throw new RuntimeException("boom");
		});
	}

	@Test
	public void executeInTransactionWithResult_functionThrows_rollsBackTransaction() throws Exception {
		try {
			PolarionUtils.executeInTransactionWithResult(() -> {
				throw new RuntimeException("boom");
			});
		}
		catch(CodeEditorException e) {
			assertTrue(endTxRollbackArg.get());
			assertTrue(e.getMessage().contains("boom"));
		}
	}

	// Workaround for missing assertFalse import
	private static void assertFalse(boolean condition) {
		assertTrue(!condition);
	}
}
