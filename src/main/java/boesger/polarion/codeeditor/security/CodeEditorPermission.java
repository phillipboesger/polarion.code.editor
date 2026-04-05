package boesger.polarion.codeeditor.security;

public final class CodeEditorPermission {

	public static final String PREFIX = "boesger.codeeditor";
	public static final String ACTION_READ = "read";
	public static final String ACTION_WRITE = "write";
	public static final String PERMISSION_READ = PREFIX + "." + ACTION_READ;
	public static final String PERMISSION_WRITE = PREFIX + "." + ACTION_WRITE;

	private CodeEditorPermission() {
	}
}

