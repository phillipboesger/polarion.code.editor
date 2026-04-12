package boesger.polarion.codeeditor.exception;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public class CodeEditorExceptionTest {

	@Test
	public void constructor_withMessage_storesMessage() {
		CodeEditorException ex = new CodeEditorException("test message");
		assertEquals("test message", ex.getMessage());
	}

	@Test
	public void constructor_withMessageAndCause_storesMessageAndCause() {
		RuntimeException cause = new RuntimeException("root cause");
		CodeEditorException ex = new CodeEditorException("wrapper", cause);
		assertEquals("wrapper", ex.getMessage());
		assertSame(cause, ex.getCause());
	}

	@Test
	public void exception_isInstanceOfException() {
		CodeEditorException ex = new CodeEditorException("msg");
		assertTrue(ex instanceof Exception);
	}

	@Test
	public void constructor_withNullMessage_allowsNull() {
		CodeEditorException ex = new CodeEditorException((String) null);
		assertEquals(null, ex.getMessage());
	}

	@Test
	public void constructor_withCause_causeMessagePreserved() {
		IllegalStateException cause = new IllegalStateException("state error");
		CodeEditorException ex = new CodeEditorException("wrapped", cause);
		assertEquals("state error", ex.getCause().getMessage());
	}
}
