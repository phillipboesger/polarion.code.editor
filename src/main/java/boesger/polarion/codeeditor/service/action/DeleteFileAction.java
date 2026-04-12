package boesger.polarion.codeeditor.service.action;

import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.codeeditor.util.PolarionUtils;
import lombok.RequiredArgsConstructor;

/**
 * Transactional action that deletes a file from the Polarion repository.
 * Returns {@code true} if the file was deleted, {@code false} if it did not exist.
 */
@RequiredArgsConstructor
public class DeleteFileAction implements PolarionUtils.RunnableWEx<Boolean> {

	private final ILocation fileLocation;

	@Override
	public Boolean run() throws Exception {
		IRepositoryConnection writeConnection = PolarionUtils.getRepositoryWriteConnection();

		if(writeConnection.exists(fileLocation)) {
			writeConnection.delete(fileLocation);
			return Boolean.TRUE;
		}

		return Boolean.FALSE;
	}
}
