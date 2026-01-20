package boesger.polarion.copilot.core.fileeditor.actions;

import com.polarion.core.util.RunnableWEx;
import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.copilot.utils.PolarionUtils;

public class CopyFileAction extends RunnableWEx<Boolean> {

  private ILocation currentFileLocation;
  private ILocation newFileLocation;
  private IRepositoryService repositoryService = PolarionUtils.getRepositoryService();

  public CopyFileAction(ILocation currentFileLocation, ILocation newFileLocation) {
    this.currentFileLocation = currentFileLocation;
    this.newFileLocation = newFileLocation;
  }

  @Override
  public Boolean runWEx() {
    IRepositoryConnection connection = repositoryService.getConnection(this.currentFileLocation);

    if (connection.exists(this.currentFileLocation)) {
      if (connection.exists(this.newFileLocation)) {
        connection.copy(this.currentFileLocation, this.newFileLocation, true);
      } else {
        connection.create(newFileLocation, connection.getContent(currentFileLocation));
      }
    }

    return connection.exists(this.newFileLocation);
  }
}
