package cu.uclv.descargar;

import org.junit.Test;
import static org.junit.Assert.*;

public class AndroidDownloadValidationTest {
    @Test public void acceptsOnlyAbsoluteFilePathsWithoutTraversal() {
        AndroidDownloadStore.validatePath("/Infantiles/Fairy Tail/episodio 1.mp4");
        assertRejected(null);
        assertRejected("relative/file.mp4");
        assertRejected("//other-host/secret.mp4");
        assertRejected("/Infantiles/../secret.mp4");
        assertRejected("/Infantiles\\secret.mp4");
        assertRejected("/Infantiles//secret.mp4");
        assertRejected("/Infantiles/folder/");
        assertRejected("/Infantiles/secret\n.mp4");
    }

    @Test public void mapsTheSameSourcePathToAStableOpaqueFileId() throws Exception {
        String first = AndroidDownloadStore.stableId("/Infantiles/Fairy Tail/01.mp4");
        String second = AndroidDownloadStore.stableId("/Infantiles/Fairy Tail/01.mp4");
        assertEquals(first, second);
        assertEquals(64, first.length());
        assertNotEquals(first, AndroidDownloadStore.stableId("/Infantiles/Fairy Tail/02.mp4"));
    }

    private static void assertRejected(String path) {
        try { AndroidDownloadStore.validatePath(path); fail("Expected invalid path: " + path); }
        catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("ruta")); }
    }
}
