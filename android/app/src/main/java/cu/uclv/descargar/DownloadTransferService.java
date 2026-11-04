package cu.uclv.descargar;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

public class DownloadTransferService extends Service {
    private static volatile boolean running;
    private AndroidDownloadStore store;
    private AndroidTransferEngine engine;
    private Thread worker;

    static boolean isRunning() { return running; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(DownloadNotification.ID, DownloadNotification.build(this, "Preparando la cola guardada"));
        if (worker == null || !worker.isAlive()) {
            running = true;
            store = new AndroidDownloadStore(this); store.recoverInterrupted();
            engine = new AndroidTransferEngine(this, store, () -> DownloadNotification.update(this, "Descargando archivos de tu lista"));
            worker = new Thread(() -> { try { engine.runQueue(); } finally { running = false; stopSelf(startId); } }, "uclv-android-downloads");
            worker.start();
        }
        return START_REDELIVER_INTENT;
    }

    @Override public void onDestroy() {
        running = false;
        if (engine != null) engine.stop();
        if (worker != null) worker.interrupt();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
