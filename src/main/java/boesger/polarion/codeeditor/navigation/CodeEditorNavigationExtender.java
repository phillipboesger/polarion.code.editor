package boesger.polarion.codeeditor.navigation;

import java.util.Collections;
import java.util.List;

import com.polarion.alm.ui.server.navigation.NavigationExtender;
import com.polarion.alm.ui.server.navigation.NavigationExtenderNode;
import com.polarion.subterra.base.data.identification.IContextId;

import boesger.polarion.codeeditor.logger.PluginLogger;

public class CodeEditorNavigationExtender extends NavigationExtender {

	private static final PluginLogger log = new PluginLogger(CodeEditorNavigationExtender.class);
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
