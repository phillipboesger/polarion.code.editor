package boesger.polarion.codeeditor.service.action;

import java.io.InputStream;

import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.platform.service.repository.IRepositoryReadOnlyConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.codeeditor.util.PolarionUtils;

public class RenameFileAction implements PolarionUtils.RunnableWEx<Boolean> {

	private final ILocation currentFileLocation;
	private final ILocation newFileLocation;

	public RenameFileAction(ILocation currentFileLocation, ILocation newFileLocation) {
		this.currentFileLocation = currentFileLocation;
		this.newFileLocation = newFileLocation;
	}

	@Override
	public Boolean run() throws Exception {
		IRepositoryReadOnlyConnection readConnection = PolarionUtils.getRepositoryService()
				.getReadOnlyConnection(IRepositoryService.DEFAULT);
		IRepositoryConnection writeConnection = PolarionUtils.getRepositoryWriteConnection();

		try(InputStream content = readConnection.getContent(currentFileLocation)) {
			writeConnection.create(newFileLocation, content);
		}

		writeConnection.delete(currentFileLocation);

		return Boolean.TRUE;
	}
}
