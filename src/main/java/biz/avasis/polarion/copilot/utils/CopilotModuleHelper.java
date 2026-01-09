package biz.avasis.polarion.copilot.utils;

import java.util.Collections;
import java.util.List;
import java.util.Set;

import com.polarion.alm.tracker.model.IModule;
import com.polarion.platform.persistence.model.IPObject;

import biz.avasis.polarion.core.dao.PolarionDAO;
import biz.avasis.polarion.core.logger.AvaLogger;
import biz.avasis.polarion.core.logger.AvaLogger.Level;
import biz.avasis.polarion.core.utils.ModuleHelper;

public class CopilotModuleHelper {

	private static final AvaLogger log = new AvaLogger(CopilotModuleHelper.class);

	/**
	 * Returns the latest historic version of the given module based on its
	 * repository history.
	 * <p>
	 * Internally this uses {@link biz.avasis.polarion.core.dao.PolarionDAO#getDataService()}
	 * and {@code IDataService.getObjectHistory(IModule)} to obtain the list of
	 * revisions for the module and then resolves the last revision via
	 * {@link biz.avasis.polarion.core.dao.PolarionDAO#getHistoricModule(IModule, String)}.
	 * </p>
	 *
	 * @param  module the current module
	 * @return        the module at its last revision, or {@code null} if no
	 *                history is available
	 */
	public IModule getPreviousVersion(IModule module) {
		try {
			if(module == null || module.isUnresolvable()) { return null; }

			List<IModule> history = PolarionDAO.getDataService().getObjectHistory(module);
			if(history.isEmpty()) { return null; }
			// last element = current state, we need the revision before that
			if(history.size() < 2) { return null; }

			IModule previousEntry = history.get(history.size() - 2);
			String revision = previousEntry.getRevision();
			if(revision == null || revision.isBlank()) { return null; }

			return getModuleVersion(module, revision);
		}
		catch(Exception e) {
			return null;
		}
	}

	/**
	 * Returns the last signed version of the given module in the specified status.
	 *
	 * @param  module   the current module
	 * @param  statusId the target status ID (e.g. "released")
	 * @return          the module at the last signed revision in that status, or {@code null}
	 */
	public IModule getLastSignedVersion(IModule module, String statusId) {
		if(module == null || module.isUnresolvable() || statusId == null || statusId.isBlank()) { return null; }

		try {
			Set<IModule> modules = ModuleHelper.getSignedModulesInStatus(module, statusId, false, true);
			return modules.isEmpty() ? null : modules.iterator().next();
		}
		catch(Exception e) {
			return null;
		}
	}

	/**
	 * Returns the historic version of the given module for the specified
	 * revision.
	 * <p>
	 * This is a small wrapper around
	 * {@link biz.avasis.polarion.core.dao.PolarionDAO#getHistoricModule(IModule, String)}
	 * so it can be used directly from Velocity.
	 * </p>
	 *
	 * @param  module   the current module
	 * @param  revision the desired revision (as String)
	 * @return          the module instance for that revision, or {@code null} if
	 *                  it cannot be resolved
	 */
	public IModule getModuleVersion(IModule module, String revision) {
		if(module == null || module.isUnresolvable()) { return null; }
		if(revision == null || revision.isBlank()) { return null; }

		try {
			return PolarionDAO.getHistoricModule(module, revision);
		}
		catch(Exception e) {
			return null;
		}
	}

	/**
	 * Returns the history of the given module in descending order (newest first).
	 *
	 * @param  module the current module
	 * @return        list of historic module versions
	 */
	public List<IModule> getModuleHistory(IModule module) {
		return getModuleHistory(module, true);
	}

	/**
	 * Returns the history of the given module.
	 *
	 * @param  module     the current module
	 * @param  descending if true, returns newest versions first
	 * @return            list of historic module versions
	 */
	public List<IModule> getModuleHistory(IModule module, boolean descending) {
		if(module == null || module.isUnresolvable()) { return Collections.emptyList(); }
		try {
			List<IModule> history = new java.util.ArrayList<>(PolarionDAO.getDataService().getObjectHistory(module));
			if(descending) {
				Collections.reverse(history);
			}
			return history;
		}
		catch(Exception e) {
			return Collections.emptyList();
		}
	}

	/**
	 * Returns the list of baselines where the given module is the base object.
	 * <p>
	 * The baselines are retrieved by querying for the modules relative path ("document/Space/Id")
	 * in the <code>baseObject</code> field.
	 * </p>
	 *
	 * @param  module the current module
	 * @return        list of baselines (IPObjectList)
	 */
	@SuppressWarnings("unchecked")
	public List<IPObject> getModuleBaselines(IModule module) {
		if(module == null || module.isUnresolvable()) { return Collections.emptyList(); }

		try {
			String projectId = module.getProjectId();
			// Note: baseObject field of Baseline is indexed. It often has the form "document/Space/Id"
			String query = "project.id:" + projectId + " AND (baseObject:\"document/" + module.getRelativePath() + "\")";

			// "~id" sorts by ID descending
			return PolarionDAO.getDataService().searchInstances("Baseline", query, "~id");
		}
		catch(Exception e) {
			log.log("Error searching baselines for module " + module.getId() + ": " + e.getMessage(), Level.ERROR);
			return Collections.emptyList();
		}
	}
}
