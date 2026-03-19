package boesger.polarion.fileeditor.core.fileeditor.actions;

import java.io.InputStream;

import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.platform.service.repository.IRepositoryReadOnlyConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.fileeditor.utils.PolarionUtils;

public class CopyFileAction implements PolarionUtils.RunnableWEx<Boolean> {

    private ILocation currentFileLocation;
    private ILocation newFileLocation;

    public CopyFileAction(ILocation currentFileLocation, ILocation newFileLocation) {
        this.currentFileLocation = currentFileLocation;
        this.newFileLocation = newFileLocation;
    }

    @Override
    public Boolean run() throws Exception {
        IRepositoryReadOnlyConnection readConnection = PolarionUtils.getRepositoryService().getReadOnlyConnection(IRepositoryService.DEFAULT);
        IRepositoryConnection writeConnection = PolarionUtils.getRepositoryWriteConnection();

        try (InputStream content = readConnection.getContent(currentFileLocation)) {
            writeConnection.create(newFileLocation, content);
        }

        return Boolean.TRUE;
    }
}
