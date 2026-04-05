package boesger.polarion.codeeditor.api;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Arrays;
import java.util.Collections;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.junit.Before;
import org.junit.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import com.polarion.platform.security.IPermission;
import com.polarion.platform.security.ISecurityService;
import com.polarion.subterra.base.data.identification.IContextId;

import boesger.polarion.codeeditor.security.CodeEditorPermission;

public class CodeEditorServletTest {

  private CodeEditorServlet servlet;

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
    servlet = new CodeEditorServlet();
    when(response.getWriter()).thenReturn(new PrintWriter(new StringWriter()));

    // Inject mocks using Reflection
    java.lang.reflect.Field securityServiceField = CodeEditorServlet.class.getDeclaredField("securityService");
    securityServiceField.setAccessible(true);
    securityServiceField.set(servlet, securityService);

    java.lang.reflect.Field readPermissionField = CodeEditorServlet.class.getDeclaredField("readPermission");
    readPermissionField.setAccessible(true);
    readPermissionField.set(servlet, readPermission);

    java.lang.reflect.Field writePermissionField = CodeEditorServlet.class.getDeclaredField("writePermission");
    writePermissionField.setAccessible(true);
    writePermissionField.set(servlet, writePermission);
  }

  private void setPermissionField(String fieldName, IPermission permission) throws Exception {
    java.lang.reflect.Field permissionField = CodeEditorServlet.class.getDeclaredField(fieldName);
    permissionField.setAccessible(true);
    permissionField.set(servlet, permission);
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
      "Missing permission: " + CodeEditorPermission.PERMISSION_READ);
  }

  @Test
  public void testDoGetHealth_AllowedForGlobalAdminRoleWithoutExplicitPermission() throws ServletException, IOException {
    when(request.getPathInfo()).thenReturn("/health");
    when(securityService.getCurrentUser()).thenReturn("tester");
    when(request.getParameter("projectId")).thenReturn("");
    when(securityService.hasPermission(readPermission, org.mockito.ArgumentMatchers.any())).thenReturn(false);
    when(securityService.getRolesForUser(org.mockito.ArgumentMatchers.eq("tester"),
      org.mockito.ArgumentMatchers.any(IContextId.class)))
      .thenReturn(Arrays.asList("admin"));

    servlet.doGet(request, response);

    verify(response).setStatus(HttpServletResponse.SC_OK);
  }

  @Test
  public void testDoGetHealth_AllowedForProjectAdminRoleWithoutExplicitPermission() throws ServletException, IOException {
    when(request.getPathInfo()).thenReturn("/health");
    when(securityService.getCurrentUser()).thenReturn("tester");
    when(request.getParameter("projectId")).thenReturn("testProject");
    when(securityService.hasPermission(readPermission, org.mockito.ArgumentMatchers.any())).thenReturn(false);
    when(securityService.getRolesForUser(org.mockito.ArgumentMatchers.eq("tester"),
      org.mockito.ArgumentMatchers.any(IContextId.class)))
      .thenReturn(Arrays.asList("project_admin"));

    servlet.doGet(request, response);

    verify(response).setStatus(HttpServletResponse.SC_OK);
  }

  @Test
  public void testDoGetHealth_AllowedForGlobalAdminRoleFromGlobalContextFallback() throws ServletException, IOException {
    when(request.getPathInfo()).thenReturn("/health");
    when(securityService.getCurrentUser()).thenReturn("tester");
    when(request.getParameter("projectId")).thenReturn("testProject");
    when(securityService.hasPermission(readPermission, org.mockito.ArgumentMatchers.any())).thenReturn(false);
    when(securityService.getRolesForUser(org.mockito.ArgumentMatchers.eq("tester"),
      org.mockito.ArgumentMatchers.any(IContextId.class)))
      .thenReturn(Collections.emptyList())
      .thenReturn(Arrays.asList("admin"));

    servlet.doGet(request, response);

    verify(response).setStatus(HttpServletResponse.SC_OK);
  }

  @Test
  public void testDoGetHealth_AllowedForAdminWhenReadPermissionUnavailable() throws Exception {
    setPermissionField("readPermission", null);
    when(request.getPathInfo()).thenReturn("/health");
    when(securityService.getCurrentUser()).thenReturn("tester");
    when(request.getParameter("projectId")).thenReturn("testProject");
    when(securityService.getRolesForUser(org.mockito.ArgumentMatchers.eq("tester"),
      org.mockito.ArgumentMatchers.any(IContextId.class)))
      .thenReturn(Collections.singletonList("admin"));

    servlet.doGet(request, response);

    verify(response).setStatus(HttpServletResponse.SC_OK);
  }

  @Test
  public void testDoGetHealth_ForbiddenForNonAdminWhenReadPermissionUnavailable() throws Exception {
    setPermissionField("readPermission", null);
    when(request.getPathInfo()).thenReturn("/health");
    when(securityService.getCurrentUser()).thenReturn("tester");
    when(request.getParameter("projectId")).thenReturn("testProject");
    when(securityService.getRolesForUser(org.mockito.ArgumentMatchers.eq("tester"),
      org.mockito.ArgumentMatchers.any(IContextId.class)))
      .thenReturn(Collections.singletonList("developer"));

    servlet.doGet(request, response);

    verify(response).sendError(HttpServletResponse.SC_FORBIDDEN,
      "Missing permission: " + CodeEditorPermission.PERMISSION_READ);
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
      "Missing permission: " + CodeEditorPermission.PERMISSION_WRITE);
  }

  @Test
  public void testDoDeleteFile_ForbiddenForNonAdminRoleWithoutWritePermission() throws ServletException, IOException {
    when(request.getPathInfo()).thenReturn("/config/file/test.json");
    when(request.getParameter("projectId")).thenReturn("testProject");
    when(securityService.getCurrentUser()).thenReturn("tester");
    when(securityService.hasPermission(writePermission, org.mockito.ArgumentMatchers.any())).thenReturn(false);
    when(securityService.getRolesForUser(org.mockito.ArgumentMatchers.eq("tester"),
      org.mockito.ArgumentMatchers.any(IContextId.class)))
      .thenReturn(Collections.singletonList("developer"));

    servlet.doDelete(request, response);

    verify(response).sendError(HttpServletResponse.SC_FORBIDDEN,
      "Missing permission: " + CodeEditorPermission.PERMISSION_WRITE);
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
      "Missing permission: " + CodeEditorPermission.PERMISSION_WRITE);
  }
}
