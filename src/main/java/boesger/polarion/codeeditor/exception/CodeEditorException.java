package boesger.polarion.codeeditor.exception;

/**
 * Represents an exception related to file operations in the CodeEditor.
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
