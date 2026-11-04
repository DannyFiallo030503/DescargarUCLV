package cu.uclv.descargar;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.os.Build;

import androidx.annotation.RequiresApi;

public class DownloadTransferJobService extends JobService {
    private static volatile boolean running;
    private AndroidDownloadStore store;
    private AndroidTransferEngine engine;
    private Thread worker;
    private volatile boolean stopRequested;

    static boolean isRunning() { return running; }

    @Override @RequiresApi(api = Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    public boolean onStartJob(JobParameters params) {
        running = true; stopRequested = false;
        store = new AndroidDownloadStore(this); store.recoverInterrupted();
        setNotification(params, DownloadNotification.ID, DownloadNotification.build(this, "Preparando la cola guardada"), JOB_END_NOTIFICATION_POLICY_REMOVE);
        engine = new AndroidTransferEngine(this, store, () -> setNotification(params, DownloadNotification.ID,
            DownloadNotification.build(this, "Descargando archivos de tu lista"), JOB_END_NOTIFICATION_POLICY_REMOVE));
        worker = new Thread(() -> {
            try { engine.runQueue(); }
            finally { running = false; if (!stopRequested) jobFinished(params, false); }
        }, "uclv-android-downloads");
        worker.start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) {
        running = false; stopRequested = true;
        if (engine != null) engine.stop();
        if (worker != null) worker.interrupt();
        if (worker != null) try { worker.join(500); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        if (store != null) store.recoverInterrupted();
        return store != null && store.hasRunnable();
    }
}
