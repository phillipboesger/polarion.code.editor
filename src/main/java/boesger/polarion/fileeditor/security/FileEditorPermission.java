package boesger.polarion.fileeditor.security;

public final class FileEditorPermission {

	public static final String PREFIX = "boesger.fileeditor";
	public static final String ACTION_READ = "read";
	public static final String ACTION_WRITE = "write";
	public static final String PERMISSION_READ = PREFIX + "." + ACTION_READ;
	public static final String PERMISSION_WRITE = PREFIX + "." + ACTION_WRITE;

	private FileEditorPermission() {
	}
}
