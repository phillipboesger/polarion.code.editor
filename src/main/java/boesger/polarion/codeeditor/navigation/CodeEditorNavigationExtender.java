package boesger.polarion.codeeditor.navigation;

import java.util.Collection;
import java.util.Collections;
import java.util.List;

import com.polarion.alm.ui.server.navigation.NavigationExtender;
import com.polarion.alm.ui.server.navigation.NavigationExtenderNode;
import com.polarion.core.util.logging.Logger;
import com.polarion.platform.core.PlatformContext;
import com.polarion.platform.security.IPermission;
import com.polarion.platform.security.ISecurityService;
import com.polarion.subterra.base.data.identification.ContextId;
import com.polarion.subterra.base.data.identification.IContextId;

import boesger.polarion.codeeditor.security.CodeEditorPermission;

/**
 * Registers the Code Editor as a navigation entry in the Polarion sidebar.
 * Visibility is controlled by the {@code boesger.codeeditor.read} permission;
 * admin roles always have access.
 */
public class CodeEditorNavigationExtender extends NavigationExtender {

	private static final Logger log = Logger.getLogger(CodeEditorNavigationExtender.class.getName());
	private static final String ROOT_ID = "code-editor";
	private static final String LABEL = "Code Editor";
	private static final String ROOT_ICON_URL = "/polarion/code-editor/resources/img/code-editor-icon.svg";
	private static final String PAGE_URL = "/polarion/code-editor/editor.html";
	private static final String GLOBAL_ADMIN_ROLE = "admin";
	private static final String PROJECT_ADMIN_ROLE = "project_admin";

	private final ISecurityService securityService;
	private final IPermission readPermission;

	public CodeEditorNavigationExtender() {
		securityService = PlatformContext.getPlatform().lookupService(ISecurityService.class);
		readPermission = constructPermissionSafely(CodeEditorPermission.PERMISSION_READ);
		log.info("CodeEditorNavigationExtender initialized.");
	}

	@Override
	public String getId() {
		return ROOT_ID;
	}

	@Override
	public String getLabel() {
		return LABEL;
	}

	@Override
	public String getIconUrl() {
		return ROOT_ICON_URL;
	}

	@Override
	public String getPageUrl(IContextId contextId) {
		if(contextId != null) {
			String projectId = contextId.getContextName();
			if(projectId != null && !projectId.isEmpty()) { return PAGE_URL + "?projectId=" + java.net.URLEncoder.encode(projectId, java.nio.charset.StandardCharsets.UTF_8); }
		}
		return PAGE_URL;
	}

	@Override
	public boolean requiresToken() {
		return false;
	}

	@Override
	public List<NavigationExtenderNode> getRootNodes(IContextId contextId) {
		if(!hasReadAccess(contextId != null ? contextId : ContextId.getGlobalContextId())) {
			return Collections.emptyList();
		}
		return Collections.emptyList();
	}

	private boolean hasReadAccess(IContextId contextId) {
		if(readPermission != null && hasPermissionInContextSafely(readPermission, contextId)) {
			return true;
		}
		IContextId globalContext = ContextId.getGlobalContextId();
		if(readPermission != null && hasPermissionInContextSafely(readPermission, globalContext)) {
			return true;
		}
		String userName = securityService.getCurrentUser();
		if(userName == null) {
			return false;
		}
		Collection<String> roles = getRolesForUserSafely(userName, contextId);
		if(hasAdminRole(roles)) {
			return true;
		}
		Collection<String> globalRoles = getRolesForUserSafely(userName, globalContext);
		return hasAdminRole(globalRoles);
	}

	private IPermission constructPermissionSafely(String permissionId) {
		try {
			return securityService.constructPermission(permissionId);
		}
		catch(IllegalArgumentException e) {
			log.warn("Unknown permission id: " + permissionId + ". Falling back to admin-role checks only.");
			return null;
		}
	}

	private boolean hasPermissionInContextSafely(IPermission permission, IContextId contextId) {
		try {
			return securityService.hasPermission(permission, contextId);
		}
		catch(IllegalArgumentException e) {
			log.warn("Ignoring invalid context for permission check: " + contextId + ". Cause: " + e.getMessage());
			return false;
		}
	}

	private Collection<String> getRolesForUserSafely(String userName, IContextId contextId) {
		try {
			return securityService.getRolesForUser(userName, contextId);
		}
		catch(IllegalArgumentException e) {
			log.warn("Ignoring invalid context for role lookup: " + contextId + ". Cause: " + e.getMessage());
			return Collections.emptyList();
		}
	}

	private boolean hasAdminRole(Collection<String> roles) {
		if(roles == null || roles.isEmpty()) {
			return false;
		}
		return roles.contains(GLOBAL_ADMIN_ROLE) || roles.contains(PROJECT_ADMIN_ROLE);
	}
}
