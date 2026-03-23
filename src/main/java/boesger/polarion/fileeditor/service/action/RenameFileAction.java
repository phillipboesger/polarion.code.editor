package boesger.polarion.fileeditor.service.action;

import com.polarion.platform.service.repository.IRepositoryConnection;
import com.polarion.subterra.base.location.ILocation;

import boesger.polarion.fileeditor.util.PolarionUtils;

public class RenameFileAction implements Runnable {

	private final ILocation currentFileLocation;
	private final ILocation newFileLocation;

	public RenameFileAction(ILocation currentFileLocation, ILocation newFileLocation) {
		this.currentFileLocation = currentFileLocation;
		this.newFileLocation = newFileLocation;
	}

	@Override
	public void run() {
		IRepositoryConnection writeConnection = PolarionUtils.getRepositoryWriteConnection();
		writeConnection.move(currentFileLocation, newFileLocation, false);
	}
}
