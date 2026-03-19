package boesger.polarion.fileeditor.core.fileeditor.actions;

import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.fileeditor.utils.PolarionUtils;

public class DeleteFileAction implements PolarionUtils.RunnableWEx<Boolean> {

    private ILocation fileLocation;

    public DeleteFileAction(ILocation fileLocation) {
        this.fileLocation = fileLocation;
    }

    @Override
    public Boolean run() throws Exception {
        IRepositoryConnection writeConnection = PolarionUtils.getRepositoryWriteConnection();

        if (writeConnection.exists(fileLocation)) {
            writeConnection.delete(fileLocation);
            return Boolean.TRUE;
        }

        return Boolean.FALSE;
    }
}
