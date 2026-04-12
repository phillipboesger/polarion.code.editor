package boesger.polarion.codeeditor.api;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.junit.Before;
import org.junit.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import com.polarion.platform.security.ISecurityService;

public class CodeEditorServletTest {

	private CodeEditorServlet servlet;

	@Mock
	private HttpServletRequest request;

	@Mock
	private HttpServletResponse response;

	@Mock
	private ISecurityService securityService;

	@Before
	public void setUp() throws Exception {
		MockitoAnnotations.openMocks(this);
		servlet = new CodeEditorServlet();
		when(response.getWriter()).thenReturn(new PrintWriter(new StringWriter()));

		java.lang.reflect.Field securityServiceField = CodeEditorServlet.class.getDeclaredField("securityService");
		securityServiceField.setAccessible(true);
		securityServiceField.set(servlet, securityService);
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
}
