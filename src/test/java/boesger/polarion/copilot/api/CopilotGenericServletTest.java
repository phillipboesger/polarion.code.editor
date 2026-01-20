package boesger.polarion.copilot.api;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.junit.Before;
import org.junit.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import com.polarion.platform.security.ISecurityService;

public class CopilotGenericServletTest {

  private CopilotGenericServlet servlet;

  @Mock
  private HttpServletRequest request;

  @Mock
  private HttpServletResponse response;

  @Mock
  private ISecurityService securityService;

  @Before
  public void setUp() throws Exception {
    MockitoAnnotations.openMocks(this);
    servlet = new CopilotGenericServlet();

    // Inject mocks using Reflection
    java.lang.reflect.Field securityServiceField = CopilotGenericServlet.class.getDeclaredField("securityService");
    securityServiceField.setAccessible(true);
    securityServiceField.set(servlet, securityService);
  }

  @Test
  public void testDoGetHealth_Unauthorized() throws ServletException, IOException {
    when(request.getPathInfo()).thenReturn("/health");

    // securityService.getCurrentUser() returns null by default (unauthorized)

    servlet.doGet(request, response);

    verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED, "User not authenticated");
  }

  @Test
  public void testDoDeleteFile() throws ServletException, IOException {
    when(request.getPathInfo()).thenReturn("/config/file/test.json");
    when(request.getParameter("projectId")).thenReturn("testProject");

    servlet.doDelete(request, response);

    // Expect unauthorized because we haven't mocked a user
    verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED);
  }

  @Test
  public void testDoPutFile() throws ServletException, IOException {
    when(request.getPathInfo()).thenReturn("/config/file/new.json");
    when(request.getParameter("projectId")).thenReturn("testProject");

    servlet.doPut(request, response);

    // Expect unauthorized
    verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED);
  }
}
