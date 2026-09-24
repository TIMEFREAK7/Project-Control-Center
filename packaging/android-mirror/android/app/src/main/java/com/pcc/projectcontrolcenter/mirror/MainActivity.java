package com.pcc.projectcontrolcenter.mirror;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugin (not an npm package), so it must be registered by hand, before
        // super.onCreate() builds the bridge. See MirrorFolderPlugin's header.
        registerPlugin(MirrorFolderPlugin.class);
        super.onCreate(savedInstanceState);
        // Same edge-to-edge opt-in as the main app's MainActivity -- see its comment.
        // Both Android projects need this independently (packaging/android and
        // packaging/android-mirror are separate Capacitor projects, same as every other
        // Android-side change in this repo -- see CLAUDE.md's adaptive icon gotcha note
        // for the standing precedent that Android fixes here apply to both).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
