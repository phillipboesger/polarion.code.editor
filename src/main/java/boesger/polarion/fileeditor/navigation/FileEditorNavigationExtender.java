package boesger.polarion.fileeditor.navigation;

import java.util.Collections;
import java.util.List;

import com.polarion.alm.ui.server.navigation.NavigationExtender;
import com.polarion.alm.ui.server.navigation.NavigationExtenderNode;
import com.polarion.platform.core.PlatformContext;
import com.polarion.platform.security.IPermission;
import com.polarion.platform.security.ISecurityService;
import com.polarion.subterra.base.data.identification.ContextId;
import com.polarion.subterra.base.data.identification.IContextId;

import boesger.polarion.fileeditor.logger.PluginLogger;
import boesger.polarion.fileeditor.security.FileEditorPermission;

public class FileEditorNavigationExtender extends NavigationExtender {

	private static final PluginLogger log = new PluginLogger(FileEditorNavigationExtender.class);
	private static final String ROOT_ID = "file-editor-root";
	private static final String LABEL = "Code Editor";
	private static final String ROOT_ICON_URL = "/polarion/icons/default/topicIcons/Tools_157-wrench.png";
	private static final String PAGE_URL = "/polarion/file-editor/editor.html";

	private final ISecurityService securityService;
	private final IPermission readPermission;

	public FileEditorNavigationExtender() {
		securityService = PlatformContext.getPlatform().lookupService(ISecurityService.class);
		readPermission = securityService.constructPermission(FileEditorPermission.PERMISSION_READ);
		log.info("FileEditorNavigationExtender initialized.");
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
		if(!securityService.hasPermission(readPermission, normalizeContextId(contextId))) {
			return Collections.emptyList();
		}
		// Keep the extender itself as the single root navigation node (no parent/child nesting).
		return Collections.emptyList();
	}

	private IContextId normalizeContextId(IContextId contextId) {
		return contextId != null ? contextId : ContextId.getGlobalContextId();
	}
}
