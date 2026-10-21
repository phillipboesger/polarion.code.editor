package boesger.polarion.codeeditor.security;

/**
 * Identifiers of the custom Polarion permissions contributed by the Code Editor plugin.
 * <p>
 * Both permissions are registered with Polarion's security framework through a
 * {@code GenericPermissionFactory} contribution in {@code META-INF/hivemodule.xml}
 * (prefix {@value #PREFIX}). Registration is what lets
 * {@code ISecurityService.constructPermission(String)} resolve them and
 * {@code ISecurityService.hasPermission(IPermission, IContextId)} evaluate them with
 * Polarion's native grant/deny semantics and global&rarr;project inheritance.
 */
public final class CodeEditorPermission {

	/** Common prefix shared by all Code Editor permissions; also the factory prefix. */
	public static final String PREFIX = "boesger.codeeditor";
	/** Action segment for read access. */
	public static final String ACTION_READ = "read";
	/** Action segment for write access. */
	public static final String ACTION_WRITE = "write";
	/** Full permission id granting read access ({@code boesger.codeeditor.read}). */
	public static final String PERMISSION_READ = PREFIX + "." + ACTION_READ;
	/** Full permission id granting write access ({@code boesger.codeeditor.write}). */
	public static final String PERMISSION_WRITE = PREFIX + "." + ACTION_WRITE;

	/**
	 * Prevents instantiation of this constants holder.
	 */
	private CodeEditorPermission() {
	}
}
