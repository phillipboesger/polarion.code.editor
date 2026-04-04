package boesger.polarion.fileeditor.api;

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

import com.polarion.platform.security.IPermission;
import com.polarion.platform.security.ISecurityService;

import boesger.polarion.fileeditor.security.FileEditorPermission;

public class FileEditorServletTest {

  private FileEditorServlet servlet;

  @Mock
  private HttpServletRequest request;

  @Mock
  private HttpServletResponse response;

  @Mock
  private ISecurityService securityService;

  @Mock
  private IPermission readPermission;

  @Mock
  private IPermission writePermission;

  @Before
  public void setUp() throws Exception {
    MockitoAnnotations.openMocks(this);
    servlet = new FileEditorServlet();

    // Inject mocks using Reflection
    java.lang.reflect.Field securityServiceField = FileEditorServlet.class.getDeclaredField("securityService");
    securityServiceField.setAccessible(true);
    securityServiceField.set(servlet, securityService);

    java.lang.reflect.Field readPermissionField = FileEditorServlet.class.getDeclaredField("readPermission");
    readPermissionField.setAccessible(true);
    readPermissionField.set(servlet, readPermission);

    java.lang.reflect.Field writePermissionField = FileEditorServlet.class.getDeclaredField("writePermission");
    writePermissionField.setAccessible(true);
    writePermissionField.set(servlet, writePermission);
  }

  @Test
  public void testDoGetHealth_Unauthorized() throws ServletException, IOException {
    when(request.getPathInfo()).thenReturn("/health");

    // securityService.getCurrentUser() returns null by default (unauthorized)

    servlet.doGet(request, response);

    verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED, "User not authenticated");
  }

  @Test
  public void testDoGetHealth_ForbiddenWithoutReadPermission() throws ServletException, IOException {
    when(request.getPathInfo()).thenReturn("/health");
    when(securityService.getCurrentUser()).thenReturn("tester");
    when(request.getParameter("projectId")).thenReturn("testProject");
    when(securityService.hasPermission(readPermission, org.mockito.ArgumentMatchers.any())).thenReturn(false);

    servlet.doGet(request, response);

    verify(response).sendError(HttpServletResponse.SC_FORBIDDEN,
      "Missing permission: " + FileEditorPermission.PERMISSION_READ);
  }

  @Test
  public void testDoDeleteFile_Unauthorized() throws ServletException, IOException {
    when(request.getPathInfo()).thenReturn("/config/file/test.json");
    when(request.getParameter("projectId")).thenReturn("testProject");

    servlet.doDelete(request, response);

    // Expect unauthorized because we haven't mocked a user
    verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED);
  }

  @Test
  public void testDoDeleteFile_ForbiddenWithoutWritePermission() throws ServletException, IOException {
    when(request.getPathInfo()).thenReturn("/config/file/test.json");
    when(request.getParameter("projectId")).thenReturn("testProject");
    when(securityService.getCurrentUser()).thenReturn("tester");
    when(securityService.hasPermission(writePermission, org.mockito.ArgumentMatchers.any())).thenReturn(false);

    servlet.doDelete(request, response);

    verify(response).sendError(HttpServletResponse.SC_FORBIDDEN,
      "Missing permission: " + FileEditorPermission.PERMISSION_WRITE);
  }

  @Test
  public void testDoPutFile_Unauthorized() throws ServletException, IOException {
    when(request.getPathInfo()).thenReturn("/config/file/new.json");
    when(request.getParameter("projectId")).thenReturn("testProject");

    servlet.doPut(request, response);

    // Expect unauthorized
    verify(response).sendError(HttpServletResponse.SC_UNAUTHORIZED);
  }

  @Test
  public void testDoPutFile_ForbiddenWithoutWritePermission() throws ServletException, IOException {
    when(request.getPathInfo()).thenReturn("/config/file/new.json");
    when(request.getParameter("projectId")).thenReturn("testProject");
    when(securityService.getCurrentUser()).thenReturn("tester");
    when(securityService.hasPermission(writePermission, org.mockito.ArgumentMatchers.any())).thenReturn(false);

    servlet.doPut(request, response);

    verify(response).sendError(HttpServletResponse.SC_FORBIDDEN,
      "Missing permission: " + FileEditorPermission.PERMISSION_WRITE);
  }
}
