package boesger.polarion.copilot.core.logger;

import java.lang.management.ManagementFactory;
import java.util.ArrayList;
import java.util.Objects;

import org.jetbrains.annotations.NotNull;

import com.polarion.core.util.exceptions.ExceptionUtils;
import com.polarion.core.util.logging.Logger;

import lombok.Getter;
import lombok.Setter;

/**
 * A logger utility class for logging messages.
 * Replaces AvaLogger.
 */
public class CopilotLogger {

  public enum Level {
    DEBUG, INFO, ERROR, WARNING
  }

  private static final boolean IS_LOCAL_DEBUG = ManagementFactory.getRuntimeMXBean().getInputArguments().toString()
      .indexOf("-agentlib:jdwp") >= 0;

  @Getter
  @Setter
  private static boolean isDebugMode = false;

  private long startTime = 0;
  private String className = null;
  private String preFix = null;
  private Logger logger;

  @Getter
  private LogFileHandler logFileHandler = new LogFileHandler();

  @Getter
  private ArrayList<String> cachedLog = new ArrayList<>();
  private boolean cachedLogActive = false;

  public CopilotLogger(String className) {
    this.logger = Logger.getLogger(className);
    this.className = className;
  }

  @SuppressWarnings("rawtypes")
  public CopilotLogger(Class clazz) {
    this.logger = Logger.getLogger(clazz.getName());
    this.className = clazz.getName();
  }

  public void log(@NotNull String msg, @NotNull Level level) {
    String message = String.format("%s: %s", preFix, msg);
    if (Objects.isNull(preFix) || "".equals(preFix)) {
      message = String.format("%s", msg);
    }
    if (isDebugMode) {
      message = String.format("COPILOT %s: %s", level.toString(), message);
    }

    switch (level) {
      case ERROR:
        logger.error(message);
        break;
      case WARNING:
        logger.warn(message);
        break;
      case DEBUG:
        if (isDebugMode) {
          logger.info(message);
        } else {
          logger.debug(message);
        }
        break;
      default:
        logger.info(message);
        break;
    }

    if (IS_LOCAL_DEBUG) {
      System.out.println(message);
    }

    if (this.cachedLogActive) {
      this.cachedLog.add(String.format("%s - %s", level.name(), message));
    }
  }

  public void beginLog(String prefix) {
    this.preFix = prefix;
    this.startTime = System.nanoTime();
    String message = String.format("Begin %s", className);
    log(message, Level.INFO);
  }

  public void endLog() {
    long stopTime = (System.nanoTime() - startTime) / 1000000;
    String message = String.format("End %s (took %s ms)", className, stopTime);
    log(message, Level.INFO);
    this.startTime = System.nanoTime();
  }

  public void info(@NotNull String msg) {
    log(msg, Level.INFO);
  }

  public void warn(@NotNull String msg) {
    log(msg, Level.WARNING);
  }

  public void error(@NotNull String msg) {
    log(msg, Level.ERROR);
  }

  public void error(String msg, Exception e) {
    log(msg, Level.ERROR);
    log(ExceptionUtils.getStackTrace(e), Level.ERROR);
  }

  public void debug(@NotNull String msg) {
    log(msg, Level.DEBUG);
  }

  public void activateCachedLogging() {
    this.cachedLogActive = true;
  }

  public void toggleCachedLogging() {
    this.cachedLogActive = !this.cachedLogActive;
  }

  public void resetCachedLog() {
    this.cachedLog = new ArrayList<>();
  }
}
