package boesger.polarion.codeeditor.exception;

/**
 * Plugin-specific exception thrown when a repository operation fails within the Code Editor.
 */
public class CodeEditorException extends Exception {

	private static final long serialVersionUID = 1L;

	public CodeEditorException(String message) {
		super(message);
	}

	public CodeEditorException(String message, Throwable throwable) {
		super(message, throwable);
	}
}
