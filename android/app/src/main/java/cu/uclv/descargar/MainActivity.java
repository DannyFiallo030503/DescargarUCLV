package cu.uclv.descargar;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidDownloadsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
