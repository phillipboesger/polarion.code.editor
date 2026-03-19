package boesger.polarion.fileeditor.core.fileeditor.actions;

import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.fileeditor.utils.PolarionUtils;

public class SaveFileAction implements PolarionUtils.RunnableWEx<Boolean> {

    private ILocation fileLocation;
    private String content;

    public SaveFileAction(ILocation fileLocation, String content) {
        this.fileLocation = fileLocation;
        this.content = content;
    }

    @Override
    public Boolean run() throws Exception {
        IRepositoryConnection writeConnection = PolarionUtils.getRepositoryWriteConnection();

        if (writeConnection.exists(fileLocation)) {
            writeConnection.setContent(fileLocation, PolarionUtils.toInputStream(content));
        } else {
            writeConnection.create(fileLocation, PolarionUtils.toInputStream(content));
        }

        return Boolean.TRUE;
    }
}
