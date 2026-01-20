package boesger.polarion.copilot.core.fileeditor;

import java.util.Date;
import java.util.Objects;

import com.polarion.platform.service.repository.IRevisionMetaData;
import com.polarion.subterra.base.location.ILocation;

/**
 * Represents a file within the Polarion repository.
 * Replacement for AvasisFile.
 */
public class RepoFile implements Comparable<RepoFile> {

  private String projectId;
  private String fileName;
  private String content;
  private ILocation location;
  private IRevisionMetaData revisionMetaData;

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

  public String getProjectId() {
    return projectId;
  }

  public String getFileName() {
    return fileName;
  }

  public String getContent() {
    return content;
  }

  public ILocation getLocation() {
    return location;
  }

  public boolean isConfigurationFile() {
    return fileName.endsWith(".xml") || fileName.endsWith(".json");
  }

  public boolean isMacroFile() {
    return fileName.endsWith(".vm");
  }

  @Override
  public int hashCode() {
    return Objects.hash(getFileName(), getProjectId());
  }

  @Override
  public boolean equals(Object obj) {
    if (this == obj)
      return true;
    if (!(obj instanceof RepoFile))
      return false;
    RepoFile other = (RepoFile) obj;
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
