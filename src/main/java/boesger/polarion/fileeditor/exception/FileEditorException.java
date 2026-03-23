package boesger.polarion.fileeditor.exception;

/**
 * Represents an exception related to file operations in the File Editor.
 */
public class FileEditorException extends Exception {

	private static final long serialVersionUID = 1L;

	public FileEditorException(String message) {
		super(message);
	}

	public FileEditorException(String message, Throwable throwable) {
		super(message, throwable);
	}
}
