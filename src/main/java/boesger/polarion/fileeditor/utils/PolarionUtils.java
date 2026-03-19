package boesger.polarion.fileeditor.utils;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import com.polarion.alm.tracker.ITrackerService;
import com.polarion.alm.tracker.model.ITrackerProject;
import com.polarion.core.util.RunnableWEx;
import com.polarion.platform.ITransactionService;
import com.polarion.platform.core.PlatformContext;
import com.polarion.platform.persistence.UnresolvableObjectException;
import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.platform.service.repository.IRepositoryService;

import boesger.polarion.fileeditor.core.logger.PluginLogger;

/**
 * Utility class to interact with Polarion services.
 */
public class PolarionUtils {

  private static final PluginLogger log = new PluginLogger(PolarionUtils.class);

  private static ITrackerService trackerService = PlatformContext.getPlatform().lookupService(ITrackerService.class);
  private static ITransactionService transactionService = PlatformContext.getPlatform()
      .lookupService(ITransactionService.class);
  private static IRepositoryService repositoryService = PlatformContext.getPlatform()
      .lookupService(IRepositoryService.class);

  public interface RunnableWEx<T> {
    T run() throws Exception;
  }

  /**
   * Gets the Repository Service.
   */
  public static IRepositoryService getRepositoryService() {
    return repositoryService;
  }

  /**
   * Gets the write connection for the default repository.
   */
  public static IRepositoryConnection getRepositoryWriteConnection() {
    return repositoryService.getConnection(IRepositoryService.DEFAULT);
  }

  /**
   * Gets the Tracker Service.
   */
  public static ITrackerService getTrackerService() {
    return trackerService;
  }

  /**
   * Retrieves a tracker project based on the provided project ID.
   */
  public static ITrackerProject getTrackerProject(String projectId) {
    ITrackerProject project = null;

    if (projectId != null && !projectId.isEmpty()) {
      project = trackerService.getTrackerProject(projectId);
      if (project.isUnresolvable()) {
        throw new UnresolvableObjectException("Project ID incorrect or project unresolvable!");
      }
    }

    return project;
  }

  /**
   * Converts a string to an InputStream using UTF-8 encoding.
   */
  public static InputStream toInputStream(String content) {
    return new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8));
  }

  /**
   * Executes a function within a transaction.
   */
  public static void executeInTransaction(Runnable function) throws Exception {
    try {
      if (!transactionService.canBeginTx()) {
        transactionService.endTx(true);
      }

      transactionService.beginTx();
      function.run();
      transactionService.endTx(false);

    } catch (Exception e) {
      log.error("Exception during transaction execution", e);
      try {
        transactionService.endTx(true);
      } catch (Exception e1) {
        log.error("Exception during transaction rollback", e1);
      }
      throw new Exception("Exception happened while committing object: " + e.getMessage(), e);
    }
  }

  /**
   * Executes a function within a transaction and returns a result.
   */
  public static <T> T executeInTransactionWithResult(RunnableWEx<T> function) throws Exception {
    T returnValue = null;
    try {
      if (!transactionService.canBeginTx()) {
        transactionService.endTx(true);
      }

      transactionService.beginTx();
      returnValue = function.run();
      transactionService.endTx(false);

    } catch (Exception e) {
      log.error("Exception during transaction execution with result", e);
      try {
        transactionService.endTx(true);
      } catch (Exception e1) {
        log.error("Exception during transaction rollback", e1);
      }
      throw new Exception("Exception happened while committing object: " + e.getMessage(), e);
    }
    return returnValue;
  }
}
