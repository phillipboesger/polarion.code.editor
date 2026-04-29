package boesger.polarion.codeeditor.navigation;

import java.util.Collections;
import java.util.List;

import com.polarion.alm.ui.server.navigation.NavigationExtender;
import com.polarion.alm.ui.server.navigation.NavigationExtenderNode;
import com.polarion.core.util.logging.Logger;
import com.polarion.subterra.base.data.identification.IContextId;

/**
 * Registers the Code Editor as a navigation entry in the Polarion sidebar.
 * Accessible by all authenticated Polarion users without additional permissions.
 */
public class CodeEditorNavigationExtender extends NavigationExtender {

	private static final Logger log = Logger.getLogger(CodeEditorNavigationExtender.class.getName());
	private static final String ROOT_ID = "code-editor";
	private static final String LABEL = "Code Editor";
	private static final String ROOT_ICON_URL = "/polarion/code-editor/resources/img/code-editor-icon.svg";
	private static final String PAGE_URL = "/polarion/code-editor/editor.html";

	public CodeEditorNavigationExtender() {
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
		return Collections.emptyList();
	}
}
