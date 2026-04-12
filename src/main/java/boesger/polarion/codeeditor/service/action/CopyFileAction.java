package boesger.polarion.codeeditor.service.action;

import java.io.InputStream;

import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.platform.service.repository.IRepositoryReadOnlyConnection;
import com.polarion.platform.service.repository.IRepositoryService;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.codeeditor.util.PolarionUtils;
import lombok.RequiredArgsConstructor;

/**
 * Transactional action that copies a file to a new location in the Polarion repository.
 */
@RequiredArgsConstructor
public class CopyFileAction implements PolarionUtils.RunnableWEx<Boolean> {

	private final ILocation currentFileLocation;
	private final ILocation newFileLocation;

	@Override
	public Boolean run() throws Exception {
		IRepositoryReadOnlyConnection readConnection = PolarionUtils.getRepositoryService().getReadOnlyConnection(IRepositoryService.DEFAULT);
		IRepositoryConnection writeConnection = PolarionUtils.getRepositoryWriteConnection();

		try(InputStream content = readConnection.getContent(currentFileLocation)) {
			writeConnection.create(newFileLocation, content);
		}

		return Boolean.TRUE;
	}
}
