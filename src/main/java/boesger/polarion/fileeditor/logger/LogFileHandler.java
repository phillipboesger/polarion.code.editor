package boesger.polarion.fileeditor.logger;

import java.io.File;
import java.util.HashSet;
import java.util.Set;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.Appender;
import org.apache.logging.log4j.core.LoggerContext;
import org.apache.logging.log4j.core.appender.RollingFileAppender;
import org.apache.logging.log4j.core.config.LoggerConfig;

public class LogFileHandler {
	private LogFileHandler() {
		// Utility class — no instances
	}

	public static Set<RollingFileAppender> getLogAppenders() {
		Set<RollingFileAppender> logAppenders = new HashSet<>();

		LoggerContext context = (LoggerContext) LogManager.getContext(false);
		LoggerConfig rootLoggerConfig = context.getConfiguration().getRootLogger();
		for(Appender appender : rootLoggerConfig.getAppenders().values()) {
			if(appender instanceof RollingFileAppender rollingFileAppender) {
				logAppenders.add(rollingFileAppender);
			}
		}

		return logAppenders;
	}

	public static Set<File> getLogFiles() {
		Set<File> logFiles = new HashSet<>();

		getLogAppenders().forEach(appender -> {
			String fileName = appender.getFileName();
			if(fileName != null) {
				logFiles.add(new File(fileName));
			}
		});

		return logFiles;
	}

	public static File getLogFile(String name) {
		return getLogAppenders().stream()
				.filter(appender -> appender.getName().equals(name))
				.map(appender -> new File(appender.getFileName()))
				.findFirst()
				.orElse(null);
	}
}
