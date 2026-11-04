package cu.uclv.descargar;

import android.Manifest;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;

import com.getcapacitor.PermissionState;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONObject;

@CapacitorPlugin(name = "AndroidDownloads", permissions = {
    @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class AndroidDownloadsPlugin extends Plugin {
    private static final int TRANSFER_JOB_ID = 24731;
    private static final long MIN_FREE_RESERVE = 64L * 1024 * 1024;

    @PluginMethod
    public void getDestinationInfo(PluginCall call) {
        call.resolve(destinationInfo());
    }

    @PluginMethod
    public void getSnapshot(PluginCall call) {
        AndroidDownloadStore queue = store();
        if (!DownloadTransferJobService.isRunning() && !DownloadTransferService.isRunning()) {
            queue.pauseInterrupted();
            boolean jobPending = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                JobScheduler scheduler = (JobScheduler) getContext().getSystemService(Context.JOB_SCHEDULER_SERVICE);
                jobPending = scheduler.getPendingJob(TRANSFER_JOB_ID) != null;
            }
            if (queue.hasRunnable() && !jobPending) {
                if (getPermissionState("notifications") != PermissionState.GRANTED || !startTransfer(queue.totalQueuedBytes())) queue.pauseAll();
            }
        }
        call.resolve(queue.toSnapshot("Descargas/Descargar UCLV", freeBytes()));
    }

    @PluginMethod
    public void enqueue(PluginCall call) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionResult");
            return;
        }
        enqueueAfterPermission(call);
    }

    @PermissionCallback
    public void notificationPermissionResult(PluginCall call) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("Para descargar en segundo plano, permite las notificaciones de progreso de Descargar UCLV.");
            return;
        }
        enqueueAfterPermission(call);
    }

    private void enqueueAfterPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Las descargas de Android requieren Android 10 o posterior para usar Descargas de forma segura."); return;
        }
        try {
            JSArray items = call.getArray("items");
            if (items == null || items.length() == 0) { call.reject("La selección no contiene archivos."); return; }
            AndroidDownloadStore queue = store();
            long free = freeBytes();
            long alreadyReserved = queue.reservedBytes();
            long knownBytes = 0;
            Set<String> existingPaths = new HashSet<>();
            for (AndroidDownloadStore.Item saved : queue.items()) existingPaths.add(saved.path);
            for (int index = 0; index < items.length(); index++) {
                JSONObject item = items.getJSONObject(index);
                String path = item.optString("path", "");
                AndroidDownloadStore.validatePath(path);
                if (existingPaths.contains(path)) continue;
                long size = item.optLong("sizeBytes", -1);
                if (size > 0) knownBytes = knownBytes > Long.MAX_VALUE - size ? Long.MAX_VALUE : knownBytes + size;
                existingPaths.add(path);
            }
            long transferBytes = knownBytes > Long.MAX_VALUE / 2 ? Long.MAX_VALUE : knownBytes * 2;
            if (knownBytes > 0 && (free <= MIN_FREE_RESERVE || alreadyReserved > free - MIN_FREE_RESERVE || transferBytes > free - MIN_FREE_RESERVE - alreadyReserved)) {
                call.reject("No hay espacio suficiente para el temporal y el archivo final. Deja al menos 64 MiB libres o elige menos contenido."); return;
            }
            int added = queue.enqueue(items);
            if ((added > 0 || queue.hasRunnable()) && !startTransfer(queue.totalQueuedBytes())) {
                queue.pauseAll(); call.reject("Android guardó la cola, pero no pudo iniciar la transferencia. Reanúdala desde Descargas."); return;
            }
            JSObject result = queue.toSnapshot("Descargas/Descargar UCLV", freeBytes());
            result.put("added", added);
            call.resolve(result);
        } catch (Exception error) { call.reject(error.getMessage() == null ? "No se pudo guardar la cola de descargas." : error.getMessage(), error); }
    }

    @PluginMethod
    public void control(PluginCall call) {
        String action = call.getString("action", "");
        AndroidDownloadStore queue = store();
        if ("pause".equals(action)) {
            queue.pauseAll(); stopTransfer();
        } else if ("resume".equals(action)) {
            if (getPermissionState("notifications") != PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "notificationPermissionResumeResult"); return;
            }
            resumeQueue(call, queue); return;
        } else if ("remove".equals(action)) {
            deletePendingFiles(queue.items()); queue.removeAll(); stopTransfer();
        } else {
            call.reject("Acción de cola no reconocida."); return;
        }
        call.resolve(queue.toSnapshot("Descargas/Descargar UCLV", freeBytes()));
    }

    @PermissionCallback
    public void notificationPermissionResumeResult(PluginCall call) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("Para reanudar en segundo plano, permite las notificaciones de progreso."); return;
        }
        resumeQueue(call, store());
    }

    private void resumeQueue(PluginCall call, AndroidDownloadStore queue) {
        queue.resumeAll();
        if (queue.hasRunnable() && !startTransfer(queue.totalQueuedBytes())) {
            queue.pauseAll(); call.reject("No se pudo iniciar la transferencia. La cola y sus parciales siguen guardados."); return;
        }
        call.resolve(queue.toSnapshot("Descargas/Descargar UCLV", freeBytes()));
    }

    private AndroidDownloadStore store() { return new AndroidDownloadStore(getContext()); }

    private JSObject destinationInfo() {
        JSObject result = new JSObject();
        boolean supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
        result.put("supported", supported); result.put("destination", "Descargas/Descargar UCLV"); result.put("platformApi", Build.VERSION.SDK_INT);
        if (supported) {
            try {
                StatFs volume = new StatFs(Environment.getExternalStorageDirectory().getAbsolutePath());
                result.put("freeBytes", volume.getAvailableBytes()); result.put("totalBytes", volume.getTotalBytes());
            } catch (RuntimeException error) {
                result.put("freeBytes", JSObject.NULL); result.put("totalBytes", JSObject.NULL);
                result.put("spaceError", "No se pudo consultar el espacio disponible.");
            }
        } else {
            result.put("freeBytes", JSObject.NULL); result.put("totalBytes", JSObject.NULL);
            result.put("spaceError", "Las descargas requieren Android 10 o posterior.");
        }
        return result;
    }

    private long freeBytes() {
        try { return new StatFs(Environment.getExternalStorageDirectory().getAbsolutePath()).getAvailableBytes(); }
        catch (RuntimeException error) { return 0; }
    }

    private boolean startTransfer(long estimatedBytes) {
        Context context = getContext().getApplicationContext();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                JobInfo.Builder builder = new JobInfo.Builder(TRANSFER_JOB_ID, new ComponentName(context, DownloadTransferJobService.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setUserInitiated(true)
                    .setEstimatedNetworkBytes(Math.max(0, estimatedBytes), 0);
                JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
                return scheduler.schedule(builder.build()) == JobScheduler.RESULT_SUCCESS;
            }
            Intent intent = new Intent(context, DownloadTransferService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent); else context.startService(intent);
            return true;
        } catch (RuntimeException error) { return false; }
    }

    private void stopTransfer() {
        Context context = getContext().getApplicationContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            scheduler.cancel(TRANSFER_JOB_ID);
        } else context.stopService(new Intent(context, DownloadTransferService.class));
    }

    private void deletePendingFiles(List<AndroidDownloadStore.Item> items) {
        ContentResolver resolver = getContext().getContentResolver();
        for (AndroidDownloadStore.Item item : items) {
            if (!AndroidDownloadStore.COMPLETED.equals(item.status)) {
                if (item.pendingUri != null) try { resolver.delete(android.net.Uri.parse(item.pendingUri), null, null); } catch (RuntimeException ignored) {}
                File root = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (root != null) new File(root, item.id + ".part").delete();
            }
        }
    }
}
