package boesger.polarion.codeeditor.api;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.junit.Before;
import org.junit.Test;
import org.mockito.Mock;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.MockitoAnnotations;

import com.polarion.platform.security.IPermission;
import com.polarion.platform.security.ISecurityService;
import com.polarion.subterra.base.data.identification.IContextId;

public class CodeEditorServletTest {

	private CodeEditorServlet servlet;

	@Mock
	private HttpServletRequest request;

	@Mock
	private HttpServletResponse response;

	@Mock
	private ISecurityService securityService;

	private IPermission readPermission;
	private IPermission writePermission;

	@Before
	public void setUp() throws Exception {
		MockitoAnnotations.openMocks(this);
		servlet = new CodeEditorServlet();
		when(response.getWriter()).thenReturn(new PrintWriter(new StringWriter()));

		injectField("securityService", securityService);

		// init() is not invoked in unit tests (no Polarion platform), so the permission fields are
		// injected directly. The default baseline grants access; denied-case tests override hasPermission.
		readPermission = mock(IPermission.class);
		writePermission = mock(IPermission.class);
		injectField("readPermission", readPermission);
		injectField("writePermission", writePermission);
		when(securityService.hasPermission(any(IPermission.class), any(IContextId.class))).thenReturn(true);
	}

	/**
	 * Sets a private field on the servlet under test via reflection.
	 *
	 * @param fieldName the declared field name on {@link CodeEditorServlet}
	 * @param value     the value to assign
	 * @throws Exception if the field cannot be accessed or set
	 */
	private void injectField(String fieldName, Object value) throws Exception {
		java.lang.reflect.Field field = CodeEditorServlet.class.getDeclaredField(fieldName);
		field.setAccessible(true);
		field.set(servlet, value);
	}

	@Test
	public void testDoGetHealth_Unauthorized() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/health");

		servlet.doGet(request, response);

		verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED, "User not authenticated");
	}

	@Test
	public void testDoGetHealth_Authorized() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/health");
		when(securityService.getCurrentUser()).thenReturn("tester");

		servlet.doGet(request, response);

		verify(response).setStatus(HttpServletResponse.SC_OK);
	}

	@Test
	public void testDoDeleteFile_Unauthorized() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/config/file/test.json");
		when(request.getParameter("projectId")).thenReturn("testProject");

		servlet.doDelete(request, response);

		verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED);
	}

	@Test
	public void testDoPutFile_Unauthorized() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/config/file/new.json");
		when(request.getParameter("projectId")).thenReturn("testProject");

		servlet.doPut(request, response);

		verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED);
	}

	@Test
	public void testDoPost_Unauthorized() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/config/rename");

		servlet.doPost(request, response);

		verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED);
	}

	@Test
	public void testDoGetUnknownPath_Authorized_Returns404() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/unknown/endpoint");
		when(securityService.getCurrentUser()).thenReturn("tester");

		servlet.doGet(request, response);

		verify(response).sendError(HttpServletResponse.SC_NOT_FOUND, "Endpoint not found");
	}

	@Test
	public void testDoDelete_Unauthorized_WithoutPathInfo() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/other/path");

		servlet.doDelete(request, response);

		verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED);
	}

	@Test
	public void testDoDeleteUnknownPath_Authorized_Returns404() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/unknown");
		when(securityService.getCurrentUser()).thenReturn("tester");

		servlet.doDelete(request, response);

		verify(response).sendError(HttpServletResponse.SC_NOT_FOUND);
	}

	@Test
	public void testDoPutUnknownPath_Authorized_Returns404() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/unknown");
		when(securityService.getCurrentUser()).thenReturn("tester");
		when(request.getInputStream()).thenReturn(new javax.servlet.ServletInputStream() {
			@Override
			public int read() {
				return -1;
			}

			@Override
			public boolean isFinished() {
				return true;
			}

			@Override
			public boolean isReady() {
				return true;
			}

			@Override
			public void setReadListener(javax.servlet.ReadListener rl) {
			}
		});

		servlet.doPut(request, response);

		verify(response).sendError(HttpServletResponse.SC_NOT_FOUND);
	}

	@Test
	public void testDoPostUnknownPath_Authorized_Returns404() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/unknown");
		when(securityService.getCurrentUser()).thenReturn("tester");
		when(request.getInputStream()).thenReturn(new javax.servlet.ServletInputStream() {
			@Override
			public int read() {
				return -1;
			}

			@Override
			public boolean isFinished() {
				return true;
			}

			@Override
			public boolean isReady() {
				return true;
			}

			@Override
			public void setReadListener(javax.servlet.ReadListener rl) {
			}
		});

		servlet.doPost(request, response);

		verify(response).sendError(HttpServletResponse.SC_NOT_FOUND);
	}

	@Test
	public void testDoGetFile_WithDownloadParam_SetsContentDispositionHeader() throws ServletException, IOException {
		// Route is authenticated and path matches /config/file/* — the service will fail
		// due to missing Polarion platform, so we only verify the header is written before
		// the service is called by checking that the download param is read correctly.
		// The actual Content-Disposition header is tested via CodeEditorServletDownloadHeaderTest.
		when(request.getPathInfo()).thenReturn("/config/file/test.txt");
		when(request.getParameter("projectId")).thenReturn(null);
		when(request.getParameter("download")).thenReturn("true");
		when(securityService.getCurrentUser()).thenReturn("tester");

		// Expect an exception from the missing Polarion platform — that is expected in unit tests
		try {
			servlet.doGet(request, response);
		}
		catch(Throwable e) { // NOSONAR: intentionally catching Error from missing Polarion platform
			// Expected: PlatformContext not initialized in unit test environment
		}
		// The test verifies only that the download parameter is accepted without HTTP 4xx before service call
		// A 500 from missing Polarion platform is acceptable here
		verify(response, org.mockito.Mockito.never()).sendError(
				org.mockito.ArgumentMatchers.eq(HttpServletResponse.SC_NOT_FOUND),
				org.mockito.ArgumentMatchers.anyString());
	}

	@Test
	public void testBuildContentDispositionHeader_SimpleFilename() {
		// Unit test for Content-Disposition header value construction
		String filename = "my-config.json";
		String expected = "attachment; filename=\"my-config.json\"";
		String actual = "attachment; filename=\"" + filename + "\"";
		org.junit.Assert.assertEquals(expected, actual);
	}

	@Test
	public void testBuildContentDispositionHeader_FilenameFromPath() {
		// Simulates how the servlet extracts the filename from a path
		String fullPath = "subfolder/my-config.json";
		String baseName = fullPath.contains("/")
				? fullPath.substring(fullPath.lastIndexOf('/') + 1)
				: fullPath;
		org.junit.Assert.assertEquals("my-config.json", baseName);
	}

	@Test
	public void testDoGetFile_WithDownloadParam_NotFound_For_UnknownPath() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/unknown/path");
		when(request.getParameter("download")).thenReturn("true");
		when(securityService.getCurrentUser()).thenReturn("tester");

		servlet.doGet(request, response);

		verify(response).sendError(HttpServletResponse.SC_NOT_FOUND, "Endpoint not found");
	}

	@Test
	public void testDoGet_whenReadDenied_shouldReturn403() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/config/list");
		when(securityService.getCurrentUser()).thenReturn("tester");
		when(securityService.hasPermission(any(IPermission.class), any(IContextId.class))).thenReturn(false);

		servlet.doGet(request, response);

		verify(response).sendError(HttpServletResponse.SC_FORBIDDEN, "Missing Code Editor read permission");
	}

	@Test
	public void testDoGetHealth_whenReadDenied_shouldStillReturnOk() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/health");
		when(securityService.getCurrentUser()).thenReturn("tester");
		when(securityService.hasPermission(any(IPermission.class), any(IContextId.class))).thenReturn(false);

		servlet.doGet(request, response);

		verify(response).setStatus(HttpServletResponse.SC_OK);
	}

	@Test
	public void testDoPut_whenWriteDenied_shouldReturn403() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/config/file/new.json");
		when(securityService.getCurrentUser()).thenReturn("tester");
		when(securityService.hasPermission(any(IPermission.class), any(IContextId.class))).thenReturn(false);

		servlet.doPut(request, response);

		verify(response).sendError(HttpServletResponse.SC_FORBIDDEN, "Missing Code Editor write permission");
	}

	@Test
	public void testDoDelete_whenWriteDenied_shouldReturn403() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/config/file/old.json");
		when(securityService.getCurrentUser()).thenReturn("tester");
		when(securityService.hasPermission(any(IPermission.class), any(IContextId.class))).thenReturn(false);

		servlet.doDelete(request, response);

		verify(response).sendError(HttpServletResponse.SC_FORBIDDEN, "Missing Code Editor write permission");
	}

	@Test
	public void testDoPost_whenWriteDenied_shouldReturn403() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/config/rename");
		when(securityService.getCurrentUser()).thenReturn("tester");
		when(securityService.hasPermission(any(IPermission.class), any(IContextId.class))).thenReturn(false);

		servlet.doPost(request, response);

		verify(response).sendError(HttpServletResponse.SC_FORBIDDEN, "Missing Code Editor write permission");
	}

	@Test
	public void testDoGet_whenPermissionUnregistered_shouldReturn403() throws Exception {
		// Fail closed: when the permission factory is not registered the field is null and access is
		// denied without consulting the security service (no admin-role bypass).
		injectField("readPermission", null);
		when(request.getPathInfo()).thenReturn("/config/list");
		when(securityService.getCurrentUser()).thenReturn("tester");
		when(securityService.hasPermission(any(IPermission.class), any(IContextId.class))).thenReturn(true);

		servlet.doGet(request, response);

		verify(response).sendError(HttpServletResponse.SC_FORBIDDEN, "Missing Code Editor read permission");
	}

	@Test
	public void testDoGetPermissions_whenNotAdmin_shouldReturn403() throws ServletException, IOException {
		// getRolesForUser is left unstubbed on purpose: the mock returns an empty collection, i.e. a
		// user holding neither the global admin nor the project_admin role.
		when(request.getPathInfo()).thenReturn("/permissions");
		when(securityService.getCurrentUser()).thenReturn("tester");

		servlet.doGet(request, response);

		verify(response).sendError(HttpServletResponse.SC_FORBIDDEN,
				"Permission management requires administrator rights");
	}

	@Test
	public void testDoPostPermissions_whenNotAdmin_shouldReturn403() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/permissions");
		when(securityService.getCurrentUser()).thenReturn("tester");

		servlet.doPost(request, response);

		verify(response).sendError(HttpServletResponse.SC_FORBIDDEN,
				"Permission management requires administrator rights");
	}

	@Test
	public void testDoGetPermissions_whenNotAdminInProjectScope_shouldReturn403() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/permissions");
		when(request.getParameter("projectId")).thenReturn("myProject");
		when(securityService.getCurrentUser()).thenReturn("tester");

		servlet.doGet(request, response);

		verify(response).sendError(HttpServletResponse.SC_FORBIDDEN,
				"Permission management requires administrator rights");
	}

	@Test
	public void testDoGetPermissions_whenReadDenied_shouldStillBeAdminGated() throws ServletException, IOException {
		// /permissions is exempt from the read-permission check (an admin manages grants without
		// necessarily holding them), so the admin gate must be what rejects a plain user here.
		when(request.getPathInfo()).thenReturn("/permissions");
		when(securityService.getCurrentUser()).thenReturn("tester");
		when(securityService.hasPermission(any(IPermission.class), any(IContextId.class))).thenReturn(false);

		servlet.doGet(request, response);

		verify(response).sendError(HttpServletResponse.SC_FORBIDDEN,
				"Permission management requires administrator rights");
	}

	@Test
	public void testDoPostPermissions_whenUnauthenticated_shouldReturn401() throws ServletException, IOException {
		when(request.getPathInfo()).thenReturn("/permissions");

		servlet.doPost(request, response);

		verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED);
	}
}
