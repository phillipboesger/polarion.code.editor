package boesger.polarion.codeeditor.model;

import java.util.Date;
import java.util.Objects;

import com.polarion.platform.service.repository.IRevisionMetaData;
import com.polarion.subterra.base.location.ILocation;

import lombok.AccessLevel;
import lombok.Getter;

/**
 * Represents a file within the Polarion repository.
 */
@Getter
public class RepoFile implements Comparable<RepoFile> {

	private final String projectId;
	private final String fileName;
	private final String content;
	private final ILocation location;
	@Getter(AccessLevel.NONE)
	private final IRevisionMetaData revisionMetaData;

	public RepoFile(String projectId, ILocation fileLocation, IRevisionMetaData revisionMetaData, String content,
			String fileName) {
		this.projectId = projectId;
		this.location = fileLocation;
		this.revisionMetaData = revisionMetaData;
		this.fileName = fileName;
		this.content = content;
	}

	public RepoFile(String projectId, ILocation fileLocation, IRevisionMetaData revisionMetaData, String content) {
		this(projectId, fileLocation, revisionMetaData, content, fileLocation.getLastComponent());
	}

	public boolean hasGlobalScope() {
		return Objects.isNull(getProjectId());
	}

	@Override
	public int hashCode() {
		return Objects.hash(getFileName());
	}

	@Override
	public boolean equals(Object obj) {
		if(this == obj)
			return true;
		if(!(obj instanceof RepoFile other))
			return false;
		return Objects.equals(getFileName(), other.getFileName());
	}

	@Override
	public int compareTo(RepoFile other) {
		return this.fileName.compareTo(other.getFileName());
	}

	public String getRevision() {
		return this.revisionMetaData.getName();
	}

	public Date getUpdated() {
		return this.revisionMetaData.getDate();
	}
}
