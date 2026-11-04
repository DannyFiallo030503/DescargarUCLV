package cu.uclv.descargar;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.os.StatFs;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Sequential, checkpointed HTTP range transfer. At most one source request is active. */
final class AndroidTransferEngine {
    interface Listener { void onChanged(); }
    private static final String SOURCE_HOST = "visuales.uclv.cu";
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 15_000;
    private static final int BUFFER_SIZE = 64 * 1024;
    private static final long CHECKPOINT_BYTES = 1024 * 1024;
    private static final long MIN_FREE_RESERVE = 64L * 1024 * 1024;
    private final Context context;
    private final AndroidDownloadStore store;
    private final AtomicBoolean stopping = new AtomicBoolean(false);
    private final AtomicReference<HttpURLConnection> activeConnection = new AtomicReference<>();
    private final Listener listener;

    AndroidTransferEngine(Context context, AndroidDownloadStore store, Listener listener) {
        this.context = context.getApplicationContext(); this.store = store; this.listener = listener;
    }

    void stop() {
        stopping.set(true);
        HttpURLConnection connection = activeConnection.getAndSet(null);
        if (connection != null) connection.disconnect();
    }

    void runQueue() {
        while (!stopping.get()) {
            AndroidDownloadStore.Item item = store.nextRunnable();
            if (item == null) return;
            try {
                for (int attempt = 0; ; attempt++) {
                    try { transfer(item); break; }
                    catch (HttpStatusException status) {
                        if (attempt > 0 || !status.retryable || stopping.get()) throw status;
                        Thread.sleep(250L);
                    }
                }
                listener.onChanged();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                if (!AndroidDownloadStore.PAUSED.equals(status(item.id))) store.updateState(item.id, AndroidDownloadStore.QUEUED, null);
                listener.onChanged();
                return;
            } catch (Exception error) {
                if (stopping.get()) {
                    if (!AndroidDownloadStore.PAUSED.equals(status(item.id))) store.updateState(item.id, AndroidDownloadStore.QUEUED, null);
                    listener.onChanged(); return;
                }
                store.updateState(item.id, AndroidDownloadStore.ERROR, safeMessage(error));
                listener.onChanged();
            }
        }
    }

    private String status(String id) {
        for (AndroidDownloadStore.Item item : store.items()) if (id.equals(item.id)) return item.status;
        return "removed";
    }

    private void transfer(AndroidDownloadStore.Item item) throws Exception {
        if (AndroidDownloadStore.PUBLISHING.equals(item.status)) {
            File recovered = partialFile(item.id);
            if (recovered.isFile()) { publish(item, recovered); return; }
        }
        File partial = partialFile(item.id);
        File directory = partial.getParentFile();
        if (directory == null || (!directory.isDirectory() && !directory.mkdirs())) throw new IllegalStateException("No se pudo preparar el archivo temporal.");
        long offset = partial.isFile() ? partial.length() : 0;
        if (offset > 0 && item.etag == null && item.lastModified == null) {
            if (!partial.delete()) throw new IllegalStateException("No se pudo reiniciar un parcial sin validador HTTP.");
            offset = 0;
        }
        if (partial.isFile() && item.sizeBytes >= 0 && offset > item.sizeBytes) { truncate(partial); offset = 0; }
        long freeBefore = availableBytes(directory);
        long minimumNeeded = item.sizeBytes >= 0 ? (item.sizeBytes - offset) + item.sizeBytes + MIN_FREE_RESERVE : MIN_FREE_RESERVE + BUFFER_SIZE;
        if (freeBefore < minimumNeeded) throw new IllegalStateException("Queda poco espacio para terminar el archivo y publicarlo en Descargas. Se conservó el parcial.");

        HttpURLConnection connection = openFollowingRedirects(item, offset);
        try {
            int code = connection.getResponseCode();
            if (code == 416) {
                long total = TransferProtocol.unsatisfiedTotal(connection.getHeaderField("Content-Range"));
                boolean sameResource = TransferProtocol.validatorMatches(item.etag, item.lastModified,
                    connection.getHeaderField("ETag"), connection.getHeaderField("Last-Modified"));
                if (sameResource && total >= 0 && partial.isFile() && partial.length() == total && (item.sizeBytes < 0 || item.sizeBytes == total)) { publish(item, partial); return; }
                throw new IllegalStateException("El servidor rechazó el punto de reanudación (HTTP 416). Revisa el archivo e inténtalo de nuevo.");
            }
            if (code < 200 || code >= 300) throw new HttpStatusException(code);
            long responseOffset = offset;
            if (code == 206) {
                String contentRange = connection.getHeaderField("Content-Range");
                if (!TransferProtocol.startsAt(contentRange, offset)) throw new IllegalStateException("El servidor devolvió un rango que no coincide con el parcial.");
                String responseEtag = connection.getHeaderField("ETag");
                String responseModified = connection.getHeaderField("Last-Modified");
                if (offset > 0 && !TransferProtocol.validatorMatches(item.etag, item.lastModified, responseEtag, responseModified)) {
                    truncate(partial); store.updateBytes(item.id, 0); store.updateState(item.id, AndroidDownloadStore.QUEUED, null);
                    throw new IllegalStateException("El archivo remoto cambió desde la pausa. Se reinició el parcial; vuelve a reanudar.");
                }
            } else if (offset > 0) {
                // If-Range changed or the server ignored Range: never append a full 200 body.
                truncate(partial); responseOffset = 0;
            }

            String etag = connection.getHeaderField("ETag");
            String lastModified = connection.getHeaderField("Last-Modified");
            if (etag == null) etag = item.etag;
            if (lastModified == null) lastModified = item.lastModified;
            store.updateProgress(item.id, responseOffset, etag, lastModified);
            listener.onChanged();

            long total = item.sizeBytes;
            if (code == 206) {
                long rangeTotal = TransferProtocol.rangeTotal(connection.getHeaderField("Content-Range"));
                if (rangeTotal >= 0) total = rangeTotal;
            } else if (connection.getContentLengthLong() >= 0) total = connection.getContentLengthLong();
            if (item.sizeBytes >= 0 && total >= 0 && item.sizeBytes != total) throw new IllegalStateException("El tamaño remoto cambió respecto al índice guardado.");
            if (total >= 0) store.updateExpectedSize(item.id, total);

            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 FileOutputStream file = new FileOutputStream(partial, responseOffset > 0);
                 BufferedOutputStream output = new BufferedOutputStream(file, BUFFER_SIZE)) {
                byte[] buffer = new byte[BUFFER_SIZE]; long received = responseOffset; long sinceCheckpoint = 0;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (stopping.get() || Thread.currentThread().isInterrupted()) throw new InterruptedException();
                    output.write(buffer, 0, read); received += read; sinceCheckpoint += read;
                    if (sinceCheckpoint >= CHECKPOINT_BYTES) {
                        output.flush(); file.getFD().sync(); store.updateProgress(item.id, received, etag, lastModified);
                        sinceCheckpoint = 0; listener.onChanged();
                        if (availableBytes(directory) < MIN_FREE_RESERVE) throw new IllegalStateException("Queda poco espacio libre. Se conservó el parcial para reanudarlo después.");
                    }
                }
                output.flush(); file.getFD().sync();
                store.updateProgress(item.id, partial.length(), etag, lastModified);
            }
            long actual = partial.length();
            if (total >= 0 && actual != total) throw new IllegalStateException("La transferencia terminó antes de completar el tamaño anunciado.");
            store.updateExpectedSize(item.id, actual);
            publish(item, partial);
        } finally { activeConnection.compareAndSet(connection, null); connection.disconnect(); }
    }

    private HttpURLConnection openFollowingRedirects(AndroidDownloadStore.Item item, long offset) throws Exception {
        URL url = sourceUrl(item.path);
        for (int redirects = 0; redirects <= 3; redirects++) {
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(CONNECT_TIMEOUT_MS); connection.setReadTimeout(READ_TIMEOUT_MS);
            if (stopping.get()) { connection.disconnect(); throw new InterruptedException(); }
            activeConnection.set(connection);
            if (stopping.get()) { activeConnection.compareAndSet(connection, null); connection.disconnect(); throw new InterruptedException(); }
            connection.setRequestProperty("Accept", "*/*"); connection.setRequestProperty("User-Agent", "DescargarUCLV/0.1 Android");
            if (offset > 0) {
                connection.setRequestProperty("Range", "bytes=" + offset + "-");
                if (item.etag != null) connection.setRequestProperty("If-Range", item.etag);
                else if (item.lastModified != null) connection.setRequestProperty("If-Range", item.lastModified);
            }
            int status;
            try { status = connection.getResponseCode(); }
            catch (Exception error) { activeConnection.compareAndSet(connection, null); connection.disconnect(); throw error; }
            if (status < 300 || status > 399) return connection;
            String location = connection.getHeaderField("Location"); activeConnection.compareAndSet(connection, null); connection.disconnect();
            if (location == null || redirects == 3) throw new IllegalStateException("El servidor realizó demasiadas redirecciones.");
            URL next = new URL(url, location);
            if (!"https".equalsIgnoreCase(next.getProtocol()) || !SOURCE_HOST.equalsIgnoreCase(next.getHost()) || next.getUserInfo() != null) throw new IllegalStateException("Se bloqueó una redirección fuera del catálogo UCLV.");
            url = next;
        }
        throw new IllegalStateException("El servidor realizó demasiadas redirecciones.");
    }

    private static URL sourceUrl(String path) throws Exception {
        AndroidDownloadStore.validatePath(path);
        StringBuilder encoded = new StringBuilder("https://").append(SOURCE_HOST);
        String[] segments = path.split("/");
        for (String segment : segments) if (!segment.isEmpty()) encoded.append('/').append(Uri.encode(segment, "-_.~"));
        if (path.endsWith("/") && encoded.charAt(encoded.length() - 1) != '/') encoded.append('/');
        return new URL(encoded.toString());
    }

    private void publish(AndroidDownloadStore.Item item, File partial) throws Exception {
        if (!partial.isFile()) throw new IllegalStateException("No se encontró el parcial guardado para terminar la descarga.");
        long length = partial.length();
        if (item.sizeBytes >= 0 && length != item.sizeBytes) throw new IllegalStateException("El archivo parcial no coincide con el tamaño esperado.");
        if (availableBytes(partial.getParentFile()) < length + MIN_FREE_RESERVE) throw new IllegalStateException("No hay espacio para publicar el archivo terminado en Descargas. Se conservó el parcial.");
        ContentResolver resolver = context.getContentResolver();
        Uri uri = item.pendingUri == null ? null : Uri.parse(item.pendingUri);
        if (uri == null || !uriExists(resolver, uri)) {
            ContentValues values = new ContentValues(); values.put(MediaStore.Downloads.DISPLAY_NAME, uniqueName(resolver, item.name));
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType(item.name));
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Descargar UCLV/");
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("Android no pudo crear el archivo en Descargas.");
            store.setPendingUri(item.id, uri.toString());
        }
        try (FileInputStream input = new FileInputStream(partial); ParcelFileDescriptor descriptor = resolver.openFileDescriptor(uri, "rwt")) {
            if (descriptor == null) throw new IllegalStateException("Android no permitió escribir el archivo en Descargas.");
            FileOutputStream output = new FileOutputStream(descriptor.getFileDescriptor());
            byte[] buffer = new byte[BUFFER_SIZE]; long copied = 0; int read;
            while ((read = input.read(buffer)) != -1) { if (stopping.get()) throw new InterruptedException(); output.write(buffer, 0, read); copied += read; }
            output.flush(); output.getFD().sync(); output.close();
            if (copied != length) throw new IllegalStateException("La copia al destino no quedó completa.");
        }
        ContentValues visible = new ContentValues(); visible.put(MediaStore.Downloads.IS_PENDING, 0);
        if (resolver.update(uri, visible, null, null) != 1) throw new IllegalStateException("No se pudo publicar el archivo terminado en Descargas.");
        store.complete(item.id, uri.toString(), length);
        // App-private bytes are removed only after MediaStore confirms publication.
        if (!partial.delete()) partial.deleteOnExit();
    }

    private boolean uriExists(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[]{MediaStore.Downloads._ID}, null, null, null)) { return cursor != null && cursor.moveToFirst(); }
        catch (RuntimeException error) { return false; }
    }

    private String uniqueName(ContentResolver resolver, String original) {
        String extension = ""; int dot = original.lastIndexOf('.');
        if (dot > 0) { extension = original.substring(dot); original = original.substring(0, dot); }
        for (int index = 0; index < 100; index++) {
            String name = index == 0 ? original + extension : original + " (" + index + ")" + extension;
            try (Cursor cursor = resolver.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, new String[]{MediaStore.Downloads._ID},
                MediaStore.Downloads.DISPLAY_NAME + "=? AND " + MediaStore.Downloads.RELATIVE_PATH + "=?",
                new String[]{name, Environment.DIRECTORY_DOWNLOADS + "/Descargar UCLV/"}, null)) {
                if (cursor == null || !cursor.moveToFirst()) return name;
            } catch (RuntimeException ignored) { return name; }
        }
        throw new IllegalStateException("No se encontró un nombre disponible para este archivo.");
    }

    private File partialFile(String id) {
        File root = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (root == null) root = new File(context.getFilesDir(), "downloads");
        return new File(root, id + ".part");
    }

    private static long availableBytes(File path) {
        try { return new StatFs(path.getAbsolutePath()).getAvailableBytes(); }
        catch (RuntimeException error) { return 0; }
    }

    private static void truncate(File file) throws Exception { try (FileOutputStream output = new FileOutputStream(file, false)) { output.getFD().sync(); } }
    private static String mimeType(String name) {
        int dot = name.lastIndexOf('.'); if (dot < 0 || dot == name.length() - 1) return "application/octet-stream";
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase(Locale.ROOT));
        return mime == null ? "application/octet-stream" : mime;
    }
    private static String safeMessage(Exception error) {
        if (error instanceof HttpStatusException) return "El servidor respondió HTTP " + ((HttpStatusException) error).status + ". Puedes reintentar manualmente.";
        String message = error.getMessage(); return message == null || message.trim().isEmpty() ? "La descarga se interrumpió. Puedes reanudarla manualmente." : message;
    }

    private static final class HttpStatusException extends Exception {
        final int status; final boolean retryable;
        HttpStatusException(int status) { this.status = status; this.retryable = status >= 500 && status != 504; }
    }
}
