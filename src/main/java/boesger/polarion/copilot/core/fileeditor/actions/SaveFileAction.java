package boesger.polarion.copilot.core.fileeditor.actions;

import java.nio.charset.StandardCharsets;

import org.apache.commons.io.IOUtils;

import com.polarion.core.util.RunnableWEx;
import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.copilot.utils.PolarionUtils;

public class SaveFileAction extends RunnableWEx<Boolean> {

  private ILocation fileLocation;
  private IRepositoryService repositoryService = PolarionUtils.getRepositoryService();
  private String content;

  public SaveFileAction(ILocation fileLocation, String content) {
    this.fileLocation = fileLocation;
    this.content = content;
  }

  @Override
  public Boolean runWEx() {
    IRepositoryConnection connection = repositoryService.getConnection(this.fileLocation);

    if (!connection.exists(this.fileLocation)) {
      connection.makeFolders(fileLocation.getParentLocation());
      connection.create(this.fileLocation, IOUtils.toInputStream(content, StandardCharsets.UTF_8));
      return true;
    } else {
      connection.setContent(this.fileLocation, IOUtils.toInputStream(content, StandardCharsets.UTF_8));
    }

    return true;
  }
}
