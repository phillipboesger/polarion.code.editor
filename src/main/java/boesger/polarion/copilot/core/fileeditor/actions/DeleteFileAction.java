package boesger.polarion.copilot.core.fileeditor.actions;

import com.polarion.core.util.RunnableWEx;
import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.copilot.utils.PolarionUtils;

public class DeleteFileAction extends RunnableWEx<Boolean> {

  private ILocation fileLocation;
  private IRepositoryService repositoryService = PolarionUtils.getRepositoryService();

  public DeleteFileAction(ILocation fileLocation) {
    this.fileLocation = fileLocation;
  }

  @Override
  public Boolean runWEx() {
    IRepositoryConnection connection = repositoryService.getConnection(this.fileLocation);

    if (connection.exists(this.fileLocation)) {
      connection.delete(this.fileLocation);
    }

    return !connection.exists(this.fileLocation);
  }
}
