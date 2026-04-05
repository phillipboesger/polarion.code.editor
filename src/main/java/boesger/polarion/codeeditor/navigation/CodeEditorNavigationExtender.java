package boesger.polarion.codeeditor.navigation;

import java.util.Collections;
import java.util.Collection;
import java.util.List;

import com.polarion.alm.ui.server.navigation.NavigationExtender;
import com.polarion.alm.ui.server.navigation.NavigationExtenderNode;
import com.polarion.platform.core.PlatformContext;
import com.polarion.platform.security.IPermission;
import com.polarion.platform.security.ISecurityService;
import com.polarion.subterra.base.data.identification.ContextId;
import com.polarion.subterra.base.data.identification.IContextId;

import boesger.polarion.codeeditor.logger.PluginLogger;
import boesger.polarion.codeeditor.security.CodeEditorPermission;

public class CodeEditorNavigationExtender extends NavigationExtender {

	private static final PluginLogger log = new PluginLogger(CodeEditorNavigationExtender.class);
	private static final String ROOT_ID = "code-editor";
	private static final String LABEL = "Code Editor";
	private static final String ROOT_ICON_URL = "/polarion/ria/images/topicIcons/integrations.svg";
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
		return PAGE_URL;
	}

	@Override
	public boolean requiresToken() {
		return false;
	}

	@Override
	public List<NavigationExtenderNode> getRootNodes(IContextId contextId) {
		if(!hasReadAccess(normalizeContextId(contextId))) { return Collections.emptyList(); }
		// Keep the extender itself as the single root navigation node (no parent/child nesting).
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

	private IContextId normalizeContextId(IContextId contextId) {
		return contextId != null ? contextId : ContextId.getGlobalContextId();
	}

	private boolean hasPermissionInContextSafely(IPermission permission, IContextId contextId) {
		try {
			return securityService.hasPermission(permission, contextId);
		}
		catch(IllegalArgumentException invalidContextEx) {
			log.warn("Ignoring invalid context for permission check: " + contextId + ". Cause: "
					+ invalidContextEx.getMessage());
			return false;
		}
	}

	private Collection<String> getRolesForUserSafely(String userName, IContextId contextId) {
		try {
			return securityService.getRolesForUser(userName, contextId);
		}
		catch(IllegalArgumentException invalidContextEx) {
			log.warn("Ignoring invalid context for role lookup: " + contextId + ". Cause: "
					+ invalidContextEx.getMessage());
			return Collections.emptyList();
		}
	}

	private boolean hasAdminRole(Collection<String> roles) {
		if(roles == null || roles.isEmpty()) {
			return false;
		}
		return roles.contains(GLOBAL_ADMIN_ROLE) || roles.contains(PROJECT_ADMIN_ROLE);
	}

	private IPermission constructPermissionSafely(String permissionId) {
		try {
			return securityService.constructPermission(permissionId);
		}
		catch(IllegalArgumentException permissionEx) {
			log.error("Unknown permission id: " + permissionId + ". Falling back to admin-role checks only.",
					permissionEx);
			return null;
		}
	}
}
