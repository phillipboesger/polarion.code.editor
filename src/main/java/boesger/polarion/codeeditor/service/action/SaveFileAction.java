package boesger.polarion.codeeditor.service.action;

import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.codeeditor.util.PolarionUtils;
import lombok.RequiredArgsConstructor;

/**
 * Transactional action that creates or overwrites a file in the Polarion repository.
 * If parent directories do not exist they are created automatically.
 */
@RequiredArgsConstructor
public class SaveFileAction implements PolarionUtils.RunnableWEx<Boolean> {

	private final ILocation fileLocation;
	private final String content;

	@Override
	public Boolean run() throws Exception {
		IRepositoryConnection writeConnection = PolarionUtils.getRepositoryWriteConnection();

		if(writeConnection.exists(fileLocation)) {
			writeConnection.setContent(fileLocation, PolarionUtils.toInputStream(content));
		}
		else {
			ILocation parentLocation = fileLocation.getParentLocation();
			if(parentLocation != null && !writeConnection.exists(parentLocation)) {
				writeConnection.makeFolders(parentLocation);
			}
			writeConnection.create(fileLocation, PolarionUtils.toInputStream(content));
		}

		return Boolean.TRUE;
	}
}
