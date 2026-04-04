package boesger.polarion.fileeditor.navigation;

import java.util.Collections;
import java.util.List;

import com.polarion.alm.ui.server.navigation.NavigationExtender;
import com.polarion.alm.ui.server.navigation.NavigationExtenderNode;
import com.polarion.subterra.base.data.identification.IContextId;

import boesger.polarion.fileeditor.logger.PluginLogger;

public class FileEditorNavigationExtender extends NavigationExtender {

	private static final PluginLogger log = new PluginLogger(FileEditorNavigationExtender.class);
	private static final String ROOT_ID = "file-editor-root";
	private static final String ITEM_ID = "file-editor-item";
	private static final String LABEL = "Code Editor";
	private static final String ROOT_ICON_URL = "/polarion/icons/default/topicIcons/Tools_157-wrench.png";
	private static final String ITEM_ICON_URL = "/polarion/icons/default/topicIconsSmall/Tools_158-wrench-2.png";
	private static final String PAGE_URL = "/polarion/file-editor/editor.html";

	public FileEditorNavigationExtender() {
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
		return Collections.singletonList(new FileEditorNode());
	}

	private static final class FileEditorNode extends NavigationExtenderNode {

		@Override
		public String getId() {
			return ITEM_ID;
		}

		@Override
		public String getLabel() {
			return LABEL;
		}

		@Override
		public String getIconUrl() {
			return ITEM_ICON_URL;
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
		public List<NavigationExtenderNode> getChildren() {
			return Collections.emptyList();
		}
	}
}
