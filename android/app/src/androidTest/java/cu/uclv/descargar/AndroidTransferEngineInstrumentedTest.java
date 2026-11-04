package cu.uclv.descargar;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.ContentValues;
import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@RunWith(AndroidJUnit4.class)
public final class AndroidTransferEngineInstrumentedTest {
    @Test
    public void recoveredPartialIsPublishedToDownloadsAndQueueCompletes() throws Exception {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) return;

        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        AndroidDownloadStore store = new AndroidDownloadStore(context);
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String name = "uclv-qa-" + suffix + ".bin";
        String path = "/QA/" + name;
        String id = AndroidDownloadStore.stableId(path);
        byte[] expected = ("Descargar UCLV MediaStore integration " + suffix).getBytes(StandardCharsets.UTF_8);
        File root = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (root == null) root = new File(context.getFilesDir(), "downloads");
        assertTrue("No se pudo preparar el directorio de parciales", root.isDirectory() || root.mkdirs());
        File partial = new File(root, id + ".part");
        ContentResolver resolver = context.getContentResolver();
        Uri publishedUri = null;

        try {
            ContentValues row = new ContentValues();
            row.put("id", id);
            row.put("name", name);
            row.put("path", path);
            row.put("size_bytes", expected.length);
            row.put("bytes_done", expected.length);
            row.put("status", AndroidDownloadStore.PUBLISHING);
            row.put("updated_at", System.currentTimeMillis());
            store.getWritableDatabase().insertOrThrow("items", null, row);
            try (FileOutputStream output = new FileOutputStream(partial)) {
                output.write(expected);
                output.getFD().sync();
            }

            new AndroidTransferEngine(context, store, () -> {}).runQueue();

            AndroidDownloadStore.Item completed = findItem(store.items(), id);
            assertNotNull("La entrada de QA desapareció de la cola", completed);
            assertEquals("La publicación falló: " + completed.error, AndroidDownloadStore.COMPLETED, completed.status);
            assertEquals(expected.length, completed.bytesDone);
            assertNotNull("No se guardó el Uri final de MediaStore", completed.finalUri);
            publishedUri = Uri.parse(completed.finalUri);
            assertTrue("El parcial debe quitarse después de publicar", !partial.exists());

            try (Cursor cursor = resolver.query(publishedUri,
                    new String[]{MediaStore.Downloads.DISPLAY_NAME, MediaStore.Downloads.RELATIVE_PATH, MediaStore.Downloads.IS_PENDING},
                    null, null, null)) {
                assertNotNull(cursor);
                assertTrue(cursor.moveToFirst());
                assertEquals(name, cursor.getString(0));
                assertEquals(Environment.DIRECTORY_DOWNLOADS + "/Descargar UCLV/", cursor.getString(1));
                assertEquals(0, cursor.getInt(2));
            }
            try (InputStream input = resolver.openInputStream(publishedUri);
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                assertNotNull(input);
                byte[] buffer = new byte[4096];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                assertArrayEquals(expected, output.toByteArray());
            }
        } finally {
            if (publishedUri != null) resolver.delete(publishedUri, null, null);
            partial.delete();
            store.getWritableDatabase().delete("items", "id=?", new String[]{id});
            store.close();
        }
    }

    private static AndroidDownloadStore.Item findItem(List<AndroidDownloadStore.Item> items, String id) {
        for (AndroidDownloadStore.Item item : items) if (id.equals(item.id)) return item;
        return null;
    }
}
