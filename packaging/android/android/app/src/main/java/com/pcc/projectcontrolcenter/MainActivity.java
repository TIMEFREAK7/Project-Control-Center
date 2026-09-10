package com.pcc.projectcontrolcenter;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrintPlugin.class);
        super.onCreate(savedInstanceState);
        // Android UI/UX Overhaul (Edge-to-Edge + Predictive Back gate): opt the WebView's
        // window into edge-to-edge layout explicitly rather than relying on Android 15's
        // (API 35+) mandatory enforcement alone -- this app's minSdkVersion is 24, so on
        // any device below API 35 edge-to-edge would otherwise never happen at all. The
        // CSS side (src/css/styles.css, env(safe-area-inset-*)) assumes this is always on.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
