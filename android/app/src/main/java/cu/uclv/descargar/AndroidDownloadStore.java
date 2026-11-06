package cu.uclv.descargar;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import org.json.JSONObject;

import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Durable metadata for Android transfers. File content stays outside SQLite. */
final class AndroidDownloadStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "download-queue.db";
    private static final int DB_VERSION = 4;

    static final String QUEUED = "queued";
    static final String DOWNLOADING = "downloading";
    static final String PAUSED = "paused";
    static final String ERROR = "error";
    static final String PUBLISHING = "publishing";
    static final String COMPLETED = "completed";

    static final class Item {
        String id;
        String name;
        String path;
        long sizeBytes;
        boolean sizeExact;
        boolean legacyTemporary;
        long bytesDone;
        String status;
        String error;
        String etag;
        String lastModified;
        String pendingUri;
        String finalUri;
        long updatedAt;
        int retryAttempts;
        long nextAttemptAt;
    }

    AndroidDownloadStore(Context context) {
        super(context.getApplicationContext(), DB_NAME, null, DB_VERSION);
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, " +
            "size_bytes INTEGER NOT NULL DEFAULT -1, size_exact INTEGER NOT NULL DEFAULT 0, legacy_temporary INTEGER NOT NULL DEFAULT 0, bytes_done INTEGER NOT NULL DEFAULT 0, " +
            "status TEXT NOT NULL, error TEXT, etag TEXT, last_modified TEXT, pending_uri TEXT, final_uri TEXT, updated_at INTEGER NOT NULL, " +
            "retry_attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE INDEX items_status_order ON items(status, updated_at)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE items ADD COLUMN retry_attempts INTEGER NOT NULL DEFAULT 0");
            db.execSQL("ALTER TABLE items ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0");
        }
        if (oldVersion < 3) db.execSQL("ALTER TABLE items ADD COLUMN size_exact INTEGER NOT NULL DEFAULT 0");
        if (oldVersion < 4) db.execSQL("ALTER TABLE items ADD COLUMN legacy_temporary INTEGER NOT NULL DEFAULT 1");
    }

    synchronized int enqueue(JSArray sourceItems) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        int added = 0;
        db.beginTransaction();
        try {
            for (int index = 0; index < sourceItems.length(); index++) {
                JSONObject source = sourceItems.getJSONObject(index);
                String path = source.optString("path", "");
                String name = source.optString("name", "");
                validatePath(path);
                validateName(name);
                if (existsByPath(db, path)) continue;
                ContentValues values = new ContentValues();
                values.put("id", stableId(path));
                values.put("name", name);
                values.put("path", path);
                values.put("size_bytes", source.optLong("sizeBytes", -1));
                values.put("size_exact", source.optBoolean("sizeExact", false) ? 1 : 0);
                values.put("legacy_temporary", 0);
                values.put("bytes_done", 0);
                values.put("status", QUEUED);
                values.put("updated_at", System.currentTimeMillis());
                db.insertOrThrow("items", null, values);
                added++;
            }
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
        return added;
    }

    private boolean existsByPath(SQLiteDatabase db, String path) {
        try (Cursor cursor = db.rawQuery("SELECT 1 FROM items WHERE path=?", new String[]{path})) { return cursor.moveToFirst(); }
    }

    synchronized List<Item> items() {
        List<Item> result = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT id,name,path,size_bytes,size_exact,legacy_temporary,bytes_done,status,error,etag,last_modified,pending_uri,final_uri,updated_at,retry_attempts,next_attempt_at FROM items ORDER BY updated_at,id", null)) {
            while (cursor.moveToNext()) {
                Item item = new Item();
                item.id = cursor.getString(0); item.name = cursor.getString(1); item.path = cursor.getString(2);
                item.sizeBytes = cursor.getLong(3); item.sizeExact = cursor.getInt(4) == 1; item.legacyTemporary = cursor.getInt(5) == 1;
                item.bytesDone = cursor.getLong(6); item.status = cursor.getString(7);
                item.error = cursor.isNull(8) ? null : cursor.getString(8); item.etag = cursor.isNull(9) ? null : cursor.getString(9);
                item.lastModified = cursor.isNull(10) ? null : cursor.getString(10); item.pendingUri = cursor.isNull(11) ? null : cursor.getString(11);
                item.finalUri = cursor.isNull(12) ? null : cursor.getString(12); item.updatedAt = cursor.getLong(13);
                item.retryAttempts = cursor.getInt(14); item.nextAttemptAt = cursor.getLong(15);
                result.add(item);
            }
        }
        return result;
    }

    synchronized Item nextRunnable() {
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT id,name,path,size_bytes,size_exact,legacy_temporary,bytes_done,status,error,etag,last_modified,pending_uri,final_uri,updated_at,retry_attempts,next_attempt_at FROM items WHERE status IN (?,?,?) ORDER BY CASE WHEN next_attempt_at<=? THEN 0 ELSE 1 END,updated_at,id LIMIT 1", new String[]{QUEUED, DOWNLOADING, PUBLISHING, String.valueOf(System.currentTimeMillis())})) {
            if (!cursor.moveToFirst()) return null;
            Item item = new Item();
            item.id = cursor.getString(0); item.name = cursor.getString(1); item.path = cursor.getString(2);
            item.sizeBytes = cursor.getLong(3); item.sizeExact = cursor.getInt(4) == 1; item.legacyTemporary = cursor.getInt(5) == 1;
            item.bytesDone = cursor.getLong(6); item.status = cursor.getString(7);
            item.error = cursor.isNull(8) ? null : cursor.getString(8); item.etag = cursor.isNull(9) ? null : cursor.getString(9);
            item.lastModified = cursor.isNull(10) ? null : cursor.getString(10); item.pendingUri = cursor.isNull(11) ? null : cursor.getString(11);
            item.finalUri = cursor.isNull(12) ? null : cursor.getString(12); item.updatedAt = cursor.getLong(13);
            item.retryAttempts = cursor.getInt(14); item.nextAttemptAt = cursor.getLong(15);
            return item;
        }
    }

    synchronized boolean hasRunnable() { return nextRunnable() != null; }

    synchronized void recoverInterrupted() {
        ContentValues values = new ContentValues(); values.put("status", QUEUED); values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("items", values, "status=?", new String[]{DOWNLOADING});
    }

    synchronized void pauseInterrupted() {
        ContentValues values = new ContentValues(); values.put("status", PAUSED); values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("items", values, "status IN (?,?)", new String[]{DOWNLOADING, PUBLISHING});
    }

    synchronized long totalQueuedBytes() {
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT COALESCE(SUM(size_bytes),0) FROM items WHERE status IN (?,?,?) AND size_bytes > 0", new String[]{QUEUED, DOWNLOADING, PUBLISHING})) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 0;
        }
    }

    synchronized long reservedBytes() {
        try (Cursor cursor = getReadableDatabase().rawQuery(
            "SELECT COALESCE(SUM(MAX(size_bytes - bytes_done, 0) + CASE WHEN legacy_temporary=1 THEN size_bytes ELSE 0 END),0) FROM items WHERE size_bytes>0 AND status!=?",
            new String[]{COMPLETED})) { return cursor.moveToFirst() ? cursor.getLong(0) : 0; }
    }

    synchronized void updateState(String id, String status, String error) {
        ContentValues values = new ContentValues(); values.put("status", status); values.put("error", error); values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("items", values, "id=?", new String[]{id});
    }

    synchronized void scheduleRetry(String id, int retryAttempts, long nextAttemptAt, String error) {
        ContentValues values = new ContentValues(); values.put("status", QUEUED); values.put("retry_attempts", retryAttempts);
        values.put("next_attempt_at", nextAttemptAt); values.put("error", error); values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("items", values, "id=?", new String[]{id});
    }

    synchronized void updateProgress(String id, long bytes, String etag, String lastModified) {
        ContentValues values = new ContentValues(); values.put("bytes_done", bytes); values.put("etag", etag); values.put("last_modified", lastModified);
        values.put("status", DOWNLOADING); values.putNull("error"); values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("items", values, "id=?", new String[]{id});
    }

    synchronized void updateBytes(String id, long bytes) {
        ContentValues values = new ContentValues(); values.put("bytes_done", bytes); values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("items", values, "id=?", new String[]{id});
    }

    synchronized void updateBytesForPendingUri(String uri, long bytes) {
        ContentValues values = new ContentValues(); values.put("bytes_done", bytes); values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("items", values, "pending_uri=?", new String[]{uri});
    }

    synchronized void updateExpectedSize(String id, long bytes, boolean exact) {
        if (bytes < 0) return;
        ContentValues values = new ContentValues(); values.put("size_bytes", bytes); values.put("size_exact", exact ? 1 : 0); values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("items", values, "id=?", new String[]{id});
    }

    synchronized void updateExpectedSize(String id, long bytes) { updateExpectedSize(id, bytes, true); }

    synchronized void resetTransfer(String id) {
        ContentValues values = new ContentValues(); values.put("bytes_done", 0); values.put("status", QUEUED);
        values.putNull("etag"); values.putNull("last_modified"); values.putNull("error"); values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("items", values, "id=?", new String[]{id});
    }

    synchronized void setPendingUri(String id, String uri) {
        ContentValues values = new ContentValues(); values.put("pending_uri", uri); values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("items", values, "id=?", new String[]{id});
    }

    synchronized void clearPendingUri(String id) {
        ContentValues values = new ContentValues(); values.putNull("pending_uri"); values.put("bytes_done", 0); values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("items", values, "id=?", new String[]{id});
    }

    synchronized void complete(String id, String uri, long bytes) {
        ContentValues values = new ContentValues(); values.put("final_uri", uri); values.putNull("pending_uri");
        values.put("bytes_done", bytes); values.put("status", COMPLETED); values.putNull("error"); values.put("updated_at", System.currentTimeMillis());
        values.put("size_bytes", bytes); values.put("size_exact", 1); values.put("legacy_temporary", 0);
        values.put("retry_attempts", 0); values.put("next_attempt_at", 0);
        values.put("legacy_temporary", 0);
        getWritableDatabase().update("items", values, "id=?", new String[]{id});
    }

    synchronized void pauseAll() {
        ContentValues values = new ContentValues(); values.put("status", PAUSED); values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("items", values, "status IN (?,?,?)", new String[]{QUEUED, DOWNLOADING, PUBLISHING});
    }

    synchronized void resumeAll() {
        ContentValues values = new ContentValues(); values.put("status", QUEUED); values.putNull("error"); values.put("updated_at", System.currentTimeMillis());
        values.put("retry_attempts", 0); values.put("next_attempt_at", 0);
        getWritableDatabase().update("items", values, "status IN (?,?,?,?)", new String[]{PAUSED, ERROR, DOWNLOADING, PUBLISHING});
    }

    synchronized void removeAll() { getWritableDatabase().delete("items", null, null); }

    synchronized void removeItem(String id) { getWritableDatabase().delete("items", "id=? AND status != ?", new String[]{id, COMPLETED}); }

    synchronized JSObject toSnapshot(String destination, long freeBytes) {
        List<Item> items = items();
        JSArray jsonItems = new JSArray();
        boolean downloading = false, queued = false, paused = false, error = false, complete = !items.isEmpty();
        long updatedAt = 0;
        for (Item item : items) {
            JSObject value = new JSObject();
            value.put("id", item.id); value.put("name", item.name); value.put("path", item.path);
            if (item.sizeBytes >= 0) value.put("sizeBytes", item.sizeBytes);
            value.put("sizeExact", item.sizeExact);
            value.put("bytesDone", item.bytesDone); value.put("status", item.status);
            value.put("retryAttempts", item.retryAttempts); if (item.nextAttemptAt > 0) value.put("nextAttemptAt", item.nextAttemptAt);
            if (item.error != null) value.put("error", item.error);
            jsonItems.put(value);
            downloading |= DOWNLOADING.equals(item.status) || PUBLISHING.equals(item.status);
            queued |= QUEUED.equals(item.status); paused |= PAUSED.equals(item.status); error |= ERROR.equals(item.status);
            complete &= COMPLETED.equals(item.status); updatedAt = Math.max(updatedAt, item.updatedAt);
        }
        String status = downloading ? "downloading" : queued ? "queued" : error ? "error" : paused ? "paused" : complete ? "completed" : "queued";
        JSObject job = new JSObject(); job.put("id", "android-queue"); job.put("destination", destination);
        job.put("destinationFreeBytes", freeBytes); job.put("status", status); job.put("updatedAt", updatedAt); job.put("items", jsonItems);
        JSArray jobs = new JSArray(); if (!items.isEmpty()) jobs.put(job);
        JSObject snapshot = new JSObject(); snapshot.put("destination", destination); snapshot.put("freeBytes", freeBytes); snapshot.put("jobs", jobs);
        return snapshot;
    }

    static String stableId(String path) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(path.getBytes("UTF-8"));
        StringBuilder result = new StringBuilder(); for (byte value : digest) result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }

    static void validatePath(String path) {
        if (path == null || !path.startsWith("/") || path.startsWith("//") || path.endsWith("/") || path.equals("/") || path.contains("//") || path.contains("\\") || hasControl(path)) throw new IllegalArgumentException("La ruta del archivo no es válida.");
        for (String segment : path.split("/")) if (".".equals(segment) || "..".equals(segment)) throw new IllegalArgumentException("La ruta del archivo no es válida.");
    }

    static void validateName(String name) {
        if (name == null || name.trim().isEmpty() || name.contains("/") || name.contains("\\") || name.equals(".") || name.equals("..") || hasControl(name)) throw new IllegalArgumentException("El nombre del archivo no es válido.");
    }

    private static boolean hasControl(String value) {
        for (int index = 0; index < value.length(); index++) if (value.charAt(index) < 0x20 || value.charAt(index) == 0x7f) return true;
        return false;
    }
}
