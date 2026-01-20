package boesger.polarion.copilot.core.fileeditor;

/**
 * Represents an exception related to file operations in the Copilot system.
 */
public class CopilotFileException extends Exception {

  private static final long serialVersionUID = 1L;

  public CopilotFileException(String message) {
    super(message);
  }

  public CopilotFileException(String message, Throwable throwable) {
    super(message, throwable);
  }
}
