package boesger.polarion.fileeditor.navigation;

import boesger.polarion.fileeditor.logger.PluginLogger;

/**
 * Intended to register the File Editor as a custom navigation entry in the Polarion sidebar,
 * making it accessible from the main navigation rather than just through the Administration panel.
 *
 * <p><b>Implementation note:</b> This class needs to implement
 * {@code com.polarion.alm.ui.server.navigation.NavigationExtender} and return the appropriate
 * navigation items. The exact API depends on the Polarion version in use.
 * Once the interface is implemented, re-enable the service-point and contribution in
 * {@code META-INF/hivemodule.xml}.</p>
 */
public class FileEditorNavigationExtender {

	private static final PluginLogger log = new PluginLogger(FileEditorNavigationExtender.class);

	public FileEditorNavigationExtender() {
		log.info("FileEditorNavigationExtender initialized.");
	}

}
