package boesger.polarion.codeeditor.model;

import java.util.Date;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import org.junit.Before;
import org.junit.Test;
import org.mockito.Mock;
import static org.mockito.Mockito.when;
import org.mockito.MockitoAnnotations;

import com.polarion.platform.service.repository.IRevisionMetaData;
import com.polarion.subterra.base.location.ILocation;

public class RepoFileTest {

	@Mock
	private ILocation location;

	@Mock
	private ILocation otherLocation;

	@Mock
	private IRevisionMetaData revisionMetaData;

	@Before
	public void setUp() {
		MockitoAnnotations.openMocks(this);
		when(location.getLastComponent()).thenReturn("myFile.xml");
	}

	@Test
	public void constructor_withExplicitFileName_storesAllFields() {
		RepoFile file = new RepoFile("proj1", location, revisionMetaData, "content", "myFile.xml");
		assertEquals("proj1", file.getProjectId());
		assertEquals("myFile.xml", file.getFileName());
		assertEquals("content", file.getContent());
		assertEquals(location, file.getLocation());
	}

	@Test
	public void constructor_withoutFileName_usesLastComponent() {
		RepoFile file = new RepoFile("proj1", location, revisionMetaData, "content");
		assertEquals("myFile.xml", file.getFileName());
	}

	@Test
	public void hasGlobalScope_nullProjectId_returnsTrue() {
		RepoFile file = new RepoFile(null, location, revisionMetaData, "content", "file.xml");
		assertTrue(file.hasGlobalScope());
	}

	@Test
	public void hasGlobalScope_nonNullProjectId_returnsFalse() {
		RepoFile file = new RepoFile("project", location, revisionMetaData, "content", "file.xml");
		assertFalse(file.hasGlobalScope());
	}

	@Test
	public void getRevision_delegatesToRevisionMetaData() {
		when(revisionMetaData.getName()).thenReturn("r42");
		RepoFile file = new RepoFile("proj", location, revisionMetaData, "content", "file.xml");
		assertEquals("r42", file.getRevision());
	}

	@Test
	public void getUpdated_delegatesToRevisionMetaData() {
		Date expected = new Date(123456789L);
		when(revisionMetaData.getDate()).thenReturn(expected);
		RepoFile file = new RepoFile("proj", location, revisionMetaData, "content", "file.xml");
		assertEquals(expected, file.getUpdated());
	}

	@Test
	public void equals_sameFileName_returnsTrue() {
		RepoFile file1 = new RepoFile("proj", location, revisionMetaData, "c1", "test.xml");
		RepoFile file2 = new RepoFile("other", otherLocation, revisionMetaData, "c2", "test.xml");
		assertEquals(file1, file2);
	}

	@Test
	public void equals_differentFileName_returnsFalse() {
		RepoFile file1 = new RepoFile("proj", location, revisionMetaData, "c", "a.xml");
		RepoFile file2 = new RepoFile("proj", location, revisionMetaData, "c", "b.xml");
		assertNotEquals(file1, file2);
	}

	@Test
	public void equals_sameInstance_returnsTrue() {
		RepoFile file = new RepoFile("proj", location, revisionMetaData, "c", "file.xml");
		assertEquals(file, file);
	}

	@Test
	public void equals_null_returnsFalse() {
		RepoFile file = new RepoFile("proj", location, revisionMetaData, "c", "file.xml");
		assertNotEquals(file, null);
	}

	@Test
	public void equals_differentType_returnsFalse() {
		RepoFile file = new RepoFile("proj", location, revisionMetaData, "c", "file.xml");
		assertNotEquals(file, "file.xml");
	}

	@Test
	public void hashCode_sameFileNameAndProjectId_sameHash() {
		RepoFile file1 = new RepoFile("proj", location, revisionMetaData, "c1", "file.xml");
		RepoFile file2 = new RepoFile("proj", otherLocation, revisionMetaData, "c2", "file.xml");
		assertEquals(file1.hashCode(), file2.hashCode());
	}

	@Test
	public void compareTo_alphabeticalOrder_returnsCorrectSign() {
		RepoFile alpha = new RepoFile("p", location, revisionMetaData, "c", "alpha.xml");
		RepoFile beta = new RepoFile("p", location, revisionMetaData, "c", "beta.xml");
		assertTrue(alpha.compareTo(beta) < 0);
		assertTrue(beta.compareTo(alpha) > 0);
	}

	@Test
	public void compareTo_equalFileName_returnsZero() {
		RepoFile file1 = new RepoFile("p", location, revisionMetaData, "c", "same.xml");
		RepoFile file2 = new RepoFile("p", location, revisionMetaData, "c", "same.xml");
		assertEquals(0, file1.compareTo(file2));
	}

	@Test
	public void getContent_nullContent_returnsNull() {
		RepoFile file = new RepoFile("proj", location, revisionMetaData, null, "file.xml");
		assertNull(file.getContent());
	}
}
