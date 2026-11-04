package cu.uclv.descargar;

import android.os.Build;
import android.os.Environment;
import android.os.StatFs;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AndroidDownloads")
public class AndroidDownloadsPlugin extends Plugin {
    @PluginMethod
    public void getDestinationInfo(PluginCall call) {
        JSObject result = new JSObject();
        boolean mediaStoreSupported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
        result.put("supported", mediaStoreSupported);
        result.put("destination", "Descargas/Descargar UCLV");
        result.put("platformApi", Build.VERSION.SDK_INT);

        if (mediaStoreSupported) {
            try {
                StatFs volume = new StatFs(Environment.getExternalStorageDirectory().getAbsolutePath());
                result.put("freeBytes", volume.getAvailableBytes());
                result.put("totalBytes", volume.getTotalBytes());
            } catch (RuntimeException error) {
                result.put("freeBytes", JSObject.NULL);
                result.put("totalBytes", JSObject.NULL);
                result.put("spaceError", "No se pudo consultar el espacio disponible.");
            }
        } else {
            result.put("freeBytes", JSObject.NULL);
            result.put("totalBytes", JSObject.NULL);
            result.put("spaceError", "Esta versión de Android requiere otro adaptador de destino.");
        }
        call.resolve(result);
    }
}
