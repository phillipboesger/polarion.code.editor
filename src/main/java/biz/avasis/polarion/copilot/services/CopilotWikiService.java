package biz.avasis.polarion.copilot.services;

import biz.avasis.polarion.copilot.utils.CopilotLlmHelper;
import biz.avasis.polarion.copilot.utils.CopilotModuleHelper;
import biz.avasis.polarion.core.logger.AvaLogger;
import biz.avasis.polarion.core.logger.AvaLogger.Level;
import biz.avasis.polarion.core.services.AvasisLicenceService;

/**
 * Helper service for use in Polarion wiki and rich page Velocity contexts.
 * <p>
 * Registered under the Velocity key <code>ava-copilot</code> via
 * hivemodule.xml, so it can be accessed from Velocity as
 * <code>$ava-copilot</code>.
 * </p>
 */
public class CopilotWikiService {
	private static final AvaLogger log = new AvaLogger(CopilotWikiService.class);
	/**
	 * Standard file for the global/project-wide LLM base configuration
	 * relative to the <code>.avasis</code> folder.
	 */
	public static final String DEFAULT_LLM_CONFIG_FILE = CopilotLlmHelper.DEFAULT_LLM_CONFIG_FILE;

	/**
	 * Logs a message to the Polarion log file via AvaLogger.
	 *
	 * @param message the message to log
	 * @param level   the log level (INFO, WARN, ERROR, DEBUG)
	 */
	public void log(String message, String level) {
		Level logLevel = Level.INFO;
		if(level != null) {
			try {
				logLevel = Level.valueOf(level.toUpperCase());
			}
			catch(IllegalArgumentException e) {
				log.log("Invalid log level '" + level + "' provided. Using INFO.", Level.WARNING);
			}
		}
		log.log(message, logLevel);
	}

	/**
	 * Returns a helper object for LLM-related operations.
	 * <p>
	 * Access via Velocity: <code>$ava-copilot.llmHelper</code>
	 * </p>
	 *
	 * @return a new instance of {@link CopilotLlmHelper}
	 */
	public CopilotLlmHelper getLlmHelper() {
		AvasisLicenceService.checkActivation(this.getClass().getName());
		return new CopilotLlmHelper();
	}

	/**
	 * Returns a helper object for Module-related operations (history, baselines, etc.).
	 * <p>
	 * Access via Velocity: <code>$ava-copilot.moduleHelper</code>
	 * </p>
	 *
	 * @return a new instance of {@link CopilotModuleHelper}
	 */
	public CopilotModuleHelper getModuleHelper() {
		AvasisLicenceService.checkActivation(this.getClass().getName());
		return new CopilotModuleHelper();
	}
}
